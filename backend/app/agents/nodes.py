"""Individual LangGraph node implementations"""

from typing import Dict
from langchain_core.messages import HumanMessage, AIMessage
import httpx
from sqlalchemy.orm import Session

from app.agents.state import ResearchState
from app.core.ai_client import ai_client
from app.core.config import settings
from app.models.database import LibraryItem, LabAsset, get_db
from app.services.vector_store import vector_store
from app.services.rag_grounding import generate_grounded_response, format_paper_context
from app.agents.specialists import get_memory_agent, get_citation_agent


# ===== CLARIFIER NODE =====

async def clarifier_node(state: ResearchState) -> Dict:
    """Check query ambiguity and ask clarifying questions if needed"""
    
    query = state["query"]
    clarification_answer = state.get("clarification_answer")
    
    # If we already have a clarification answer, refine the query
    if clarification_answer:
        refined_query = f"{query} (specifically: {clarification_answer})"
        return {
            "query": refined_query,
            "needs_clarification": False,
            "logs": [{
                "step": "clarifier",
                "source": "Clarifier",
                "message": f"✓ Query refined based on clarification: {clarification_answer}",
                "status": "completed"
            }]
        }
    
    # Analyze query ambiguity
    log_entry = {
        "step": "clarifier",
        "source": "Clarifier",
        "message": "Analyzing query clarity...",
        "status": "processing"
    }
    
    # Use AI to detect ambiguity
    prompt = f"""Analyze this research query for ambiguity on a scale of 0.0 (clear) to 1.0 (ambiguous).

Query: "{query}"

Consider:
- Is the topic too broad? (e.g., "machine learning" vs "machine learning for medical diagnosis")
- Are there multiple interpretations? (e.g., "RAG systems" could mean architecture OR applications)
- Are key constraints missing? (e.g., "neural networks" - what domain? what year range?)

Respond ONLY with a number from 0.0 to 1.0, then on the next line, if ambiguous (>0.7), provide ONE clarifying question.

Format:
<score>
<question if needed>
"""
    
    response = await ai_client.generate_text(prompt, temperature=0.3, use_flash=True)
    lines = response.strip().split('\n')
    
    try:
        score = float(lines[0].strip())
        score = max(0.0, min(1.0, score))  # Clamp to 0-1
    except (ValueError, IndexError):
        score = 0.5  # Default to moderate ambiguity if parsing fails
    
    # Extract clarifying question if provided
    clarifying_question = None
    if len(lines) > 1 and score > 0.7:
        clarifying_question = '\n'.join(lines[1:]).strip()
    
    # If highly ambiguous, request clarification
    if score > 0.7 and clarifying_question:
        return {
            "query_ambiguity_score": score,
            "clarification_question": clarifying_question,
            "needs_clarification": True,
            "logs": [{
                "step": "clarifier",
                "source": "Clarifier",
                "message": f"❓ Query is ambiguous (score: {score:.2f}). Asking for clarification...",
                "status": "awaiting_user"
            }]
        }
    else:
        # Query is clear enough, proceed
        return {
            "query_ambiguity_score": score,
            "needs_clarification": False,
            "logs": [{
                "step": "clarifier",
                "source": "Clarifier",
                "message": f"✓ Query is clear (ambiguity score: {score:.2f})",
                "status": "completed"
            }]
        }


# ===== ROUTER NODE =====

async def router_node(state: ResearchState) -> Dict:
    """Classify user intent and route to appropriate subgraph"""
    
    query = state["query"]
    memory = get_memory_agent()
    
    # Add interaction to memory
    await memory.add_interaction("user", query)
    
    # Log step
    log_entry = {
        "step": "router",
        "source": "Router",
        "message": f"Analyzing intent for: '{query[:50]}...'",
        "status": "processing"
    }
    
    # Classify intent using AI
    intent = await ai_client.classify_intent(query)
    
    # Log agent activity
    agent_log = {
        "agent": "router",
        "action": "classify_intent",
        "result": intent,
        "timestamp": None
    }
    
    return {
        "intent": intent,
        "agent_history": [agent_log],
        "logs": [
            log_entry,
            {
                "step": "router",
                "source": "Router",
                "message": f"✓ Intent classified as: {intent}",
                "status": "completed"
            }
        ]
    }


# ===== SEARCH NODE (Discovery Loop) =====

async def search_node(state: ResearchState) -> Dict:
    """Search external APIs for papers with query analysis"""
    
    from app.services.query_analyzer import query_analyzer
    from app.services.paper_search import search_all_sources
    
    query = state.get("refined_query") or state["query"]
    iteration = state.get("search_iteration", 0)
    
    # Log step
    log_entry = {
        "step": "search",
        "source": "Search",
        "message": f"Analyzing query and searching (iteration {iteration + 1})...",
        "status": "processing"
    }
    
    try:
        # Step 1: Analyze query
        analysis = await query_analyzer.analyze_query(query)
        optimized_query = analysis.get("search_query", query)
        
        # Log query analysis
        thought_log = {
            "step": "search",
            "source": "QueryAnalyzer",
            "message": f"💡 {analysis.get('thought', 'Query analyzed')}",
            "status": "completed"
        }
        
        # Step 2: Search all sources with optimized query
        found_papers = search_all_sources(optimized_query, max_results_per_source=5)
        
        # Step 3: If primary search fails, try expanded queries
        if len(found_papers) < 3 and analysis.get("expanded_queries"):
            for expanded_query in analysis["expanded_queries"][:2]:  # Try up to 2 expanded queries
                additional_papers = search_all_sources(expanded_query, max_results_per_source=3)
                found_papers.extend(additional_papers)
                
                if len(found_papers) >= 5:  # Stop if we have enough results
                    break
        
        # Deduplicate again after combining expanded results
        unique_papers = {}
        for paper in found_papers:
            title = paper.get('title') or ''
            title_key = title.lower().strip()
            if title_key and title_key not in unique_papers:
                unique_papers[title_key] = paper
        
        found_papers = list(unique_papers.values())[:10]  # Limit to 10 total
        
        # === AUTO-SAVE TO PROJECT LIBRARY ===
        project_id = state.get("project_id")
        if project_id:
            try:
                db = next(get_db())
                for paper in found_papers:
                    # Check if already exists in this project
                    exists = db.query(LibraryItem).filter(
                        LibraryItem.project_id == project_id,
                        LibraryItem.title == paper["title"]
                    ).first()
                    
                    if not exists:
                        new_item = LibraryItem(
                            project_id=project_id,
                            title=paper["title"],
                            authors=paper.get("authors", []),
                            year=paper.get("year"),
                            abstract=paper.get("abstract") or paper.get("summary", ""),
                            url=paper.get("url") or paper.get("pdf_url"),
                            arxiv_id=paper.get("paperId") if "arxiv" in str(paper.get("paperId", "")).lower() else None,
                            is_selected_for_context=False  # Auto-added but not auto-selected for chat context
                        )
                        db.add(new_item)
                        # Add the DB ID to the paper object in state so frontend can link it
                        # But wait, we need to commit first to get ID
                db.commit()
                db.close()
            except Exception as save_err:
                print(f"Error auto-saving papers: {save_err}") # Non-blocking
        
        return {
            "found_papers": found_papers,
            "search_iteration": iteration + 1,
            "logs": [
                log_entry,
                thought_log,
                {
                    "step": "search",
                    "source": "MultiSourceSearch",
                    "message": f"✓ Found {len(found_papers)} papers and saved to library",
                    "status": "completed",
                    "metadata": {
                        "count": len(found_papers),
                        "optimized_query": optimized_query
                    }
                }
            ]
        }
    
    except Exception as e:
        return {
            "found_papers": [],
            "search_iteration": iteration + 1,
            "error": str(e),
            "logs": [
                {
                    "step": "search",
                    "source": "Search",
                    "message": f"✗ Search failed: {str(e)}",
                    "status": "error"
                }
            ]
        }


# ===== RANKER NODE (Discovery Loop Decision Point) =====

async def ranker_node(state: ResearchState) -> Dict:
    """Score papers for relevance using AI"""
    
    query = state["query"]
    found_papers = state["found_papers"]
    
    log_entry = {
        "step": "rank",
        "source": "Ranker",
        "message": f"Scoring {len(found_papers)} papers for relevance...",
        "status": "processing"
    }
    
    ranked_papers = []
    
    for paper in found_papers:
        # Score using AI
        score = await ai_client.score_paper_relevance(
            paper["title"],
            paper["abstract"],
            query
        )
        
        paper["relevance_score"] = score
        ranked_papers.append(paper)
    
    # Sort by relevance
    ranked_papers.sort(key=lambda p: p["relevance_score"], reverse=True)
    
    # Check if any paper meets threshold
    top_score = ranked_papers[0]["relevance_score"] if ranked_papers else 0.0
    meets_threshold = top_score >= settings.relevance_threshold
    
    return {
        "ranked_papers": ranked_papers,
        "logs": [
            log_entry,
            {
                "step": "rank",
                "source": "Ranker",
                "message": f"✓ Ranked {len(ranked_papers)} papers. Top score: {top_score:.2f}",
                "status": "completed",
                "metadata": {
                    "top_score": top_score,
                    "meets_threshold": meets_threshold
                }
            }
        ]
    }


# ===== RESEARCH COORDINATOR NODE (Intelligent Search Management) =====

async def research_coordinator_node(state: ResearchState) -> Dict:
    """Intelligent agent that evaluates search results and decides strategy"""
    from app.agents.specialists import get_research_coordinator_agent
    
    coordinator = get_research_coordinator_agent()
    
    query = state["query"]
    found_papers = state["found_papers"]
    ranked_papers = state["ranked_papers"]
    iteration = state.get("search_iteration", 0)
    
    log_entry = {
        "step": "research_coordinator",
        "source": "Research Coordinator",
        "message": "🧭 Evaluating search results and strategy...",
        "status": "processing"
    }
    
    # Get intelligent decision from coordinator agent
    evaluation = await coordinator.evaluate_search_results(
        query=query,
        found_papers=found_papers,
        ranked_papers=ranked_papers,
        iteration=iteration
    )
    
    decision = evaluation["decision"]
    reasoning = evaluation["reasoning"]
    suggestions = evaluation["suggestions"]
    
    # Build response log
    response_log = {
        "step": "research_coordinator",
        "source": "Research Coordinator",
        "message": f"🧭 Decision: {decision.upper()}",
        "status": "completed",
        "metadata": {
            "decision": decision,
            "reasoning": reasoning,
            "suggestions": suggestions,
            "quality_metrics": evaluation["quality_metrics"]
        }
    }
    
    return {
        "coordinator_decision": decision,
        "coordinator_reasoning": reasoning,
        "coordinator_suggestions": suggestions,
        "agent_history": [{
            "agent": "research_coordinator",
            "decision": decision,
            "reasoning": reasoning,
            "timestamp": None
        }],
        "logs": [log_entry, response_log]
    }


# ===== QUERY REFINER NODE (Discovery Loop Retry) =====

async def refine_query_node(state: ResearchState) -> Dict:
    """Refine search query based on coordinator's suggestions"""
    from app.agents.specialists import get_research_coordinator_agent
    
    coordinator = get_research_coordinator_agent()
    
    original_query = state["query"]
    iteration = state["search_iteration"]
    coordinator_suggestions = state.get("coordinator_suggestions", "")
    ranked_papers = state.get("ranked_papers", [])
    
    log_entry = {
        "step": "refine",
        "source": "QueryRefiner",
        "message": "Refining query based on coordinator guidance...",
        "status": "processing"
    }
    
    # Get refined query from coordinator
    reason = coordinator_suggestions if coordinator_suggestions else "Results not optimal"
    refined_query = await coordinator.suggest_query_refinement(
        original_query=original_query,
        search_results=ranked_papers,
        reason=reason
    )
    
    return {
        "refined_query": refined_query,
        "search_iteration": iteration + 1,
        "logs": [
            log_entry,
            {
                "step": "refine",
                "source": "QueryRefiner",
                "message": f"✓ Refined query: \"{refined_query}\"",
                "status": "completed"
            }
        ]
    }


# ===== OLD REFINE NODE (BACKUP - can be removed) =====

async def refine_query_node_old(state: ResearchState) -> Dict:
    """Refine search query based on failed results"""
    
    original_query = state["query"]
    iteration = state["search_iteration"]
    
    log_entry = {
        "step": "refine",
        "source": "QueryRefiner",
        "message": "Refining query for better results...",
        "status": "processing"
    }
    
    # Use AI to suggest refinement
    prompt = f"""The search query "{original_query}" returned no relevant papers.
Suggest a refined, more specific search query that might yield better results.
Return ONLY the refined query, nothing else."""
    
    refined = await ai_client.generate_text(prompt, temperature=0.7, use_flash=True)
    
    return {
        "refined_query": refined.strip(),
        "logs": [
            log_entry,
            {
                "step": "refine",
                "source": "QueryRefiner",
                "message": f"✓ Refined query: '{refined.strip()}'",
                "status": "completed"
            }
        ]
    }


# ===== LAB ANALYST NODE =====

async def lab_analyst_node(state: ResearchState) -> Dict:
    """Analyze lab assets using Gemini Vision"""
    
    asset_ids = state["lab_asset_ids"]
    project_id = state["project_id"]
    
    if not asset_ids:
        return {"logs": []}
    
    log_entry = {
        "step": "lab_analyst",
        "source": "LabAnalyst",
        "message": f"Analyzing {len(asset_ids)} lab assets...",
        "status": "processing"
    }
    
    descriptions = []
    
    # Get database session
    db = next(get_db())
    
    try:
        for asset_id in asset_ids:
            asset = db.query(LabAsset).filter(LabAsset.id == asset_id).first()
            
            if asset and asset.asset_type == "image":
                # Analyze with AI Vision
                if not asset.ai_description:
                    description = await ai_client.analyze_image(
                        asset.file_path,
                        prompt="Provide a detailed scientific description of this figure. Identify axes, trends, key data points, and any notable patterns."
                    )
                    
                    # Save description to DB
                    asset.ai_description = description
                    db.commit()
                    
                    descriptions.append(description)
                else:
                    descriptions.append(asset.ai_description)
        
        return {
            "lab_asset_descriptions": descriptions,
            "logs": [
                log_entry,
                {
                    "step": "lab_analyst",
                    "source": "LabAnalyst",
                    "message": f"✓ Analyzed {len(descriptions)} assets",
                    "status": "completed"
                }
            ]
        }
    
    finally:
        db.close()


# ===== WRITER NODE (Drafting Workflow) =====

async def writer_node(state: ResearchState) -> Dict:
    """Generate academic text with section-aware context blending"""
    
    from app.agents.prompts import format_section_prompt, get_context_weights
    from app.models.database import ResearchAsset
    
    query = state["query"]
    selected_paper_ids = state["selected_paper_ids"]
    research_asset_ids = state.get("research_asset_ids", [])
    current_section = state.get("current_section", "general")
    lab_descriptions = state.get("lab_asset_descriptions", [])
    revision_count = state.get("revision_count", 0)
    critique = state.get("critique_feedback")
   
    log_entry = {
        "step": "writer",
        "source": "Writer",
        "message": f"Drafting {current_section} section (revision {revision_count})...",
        "status": "processing"
    }
    
    # === SECTION-AWARE CONTEXT GATHERING ===
    
    # 1. Get literature context from papers
    literature_context = ""
    if selected_paper_ids:
        project_id = state["project_id"]
        context_chunks = await vector_store.search_similar(
            project_id,
            query,
            paper_ids=selected_paper_ids,
            top_k=5
        )
        literature_context = "\n\n".join(context_chunks) if context_chunks else ""
    
    # 2. Get research context from student's assets
    research_context = ""
    db = next(get_db())
    try:
        if research_asset_ids:
            research_assets = db.query(ResearchAsset).filter(
                ResearchAsset.id.in_(research_asset_ids)
            ).all()
            
            research_parts = []
            for asset in research_assets:
                asset_info = f"**{asset.name}** ({asset.asset_type})"
                if asset.description:
                    asset_info += f": {asset.description}"
                if asset.methodology_note:
                    asset_info += f"\nMethodology: {asset.methodology_note}"
                if asset.ai_analysis:
                    asset_info += f"\nAnalysis: {asset.ai_analysis}"
                research_parts.append(asset_info)
            
            research_context = "\n\n".join(research_parts)
        
        # Fallback to legacy lab descriptions if no research assets
        if not research_context and lab_descriptions:
            research_context = "\n".join(lab_descriptions)
    
    finally:
        db.close()
    
    # === APPLY SECTION-AWARE WEIGHTING ===
    research_weight, lit_weight = get_context_weights(current_section)
    
    # Add weight indicators to help the LLM prioritize
    if research_weight > lit_weight:
        research_context = f"**PRIMARY FOCUS** (Student's Work):\n{research_context}" if research_context else ""
        literature_context = f"Supporting Context (Prior Work):\n{literature_context}" if literature_context else ""
    elif lit_weight > research_weight:
        literature_context = f"**PRIMARY FOCUS** (Prior Research):\n{literature_context}" if literature_context else ""
        research_context = f"Supporting Context (Student's Work):\n{research_context}" if research_context else ""
    
    # === BUILD SECTION-SPECIFIC PROMPT ===
    prompt = format_section_prompt(
        current_section,
        query,
        literature_context=literature_context or "None provided.",
        research_context=research_context or "None provided."
    )
    
    # Add revision feedback if exists
    if critique:
        prompt += f"\n\n**REVISION FEEDBACK FROM REVIEWER:**\n{critique}\n\nPlease address this feedback."
    
    # === GENERATE TEXT ===
    # ALWAYS use studio mode for academic writing (original, plagiarism-free)
    # This ensures scholarflow-studio (3B) is used for drafting, not general model
    draft_text = await ai_client.generate_text(
        prompt, 
        temperature=0.7,
        mode="studio"  # Force studio mode for all drafting
    )
    
    # Add to memory
    memory = get_memory_agent()
    await memory.add_interaction("assistant", f"Generated {current_section} section", {
        "section": current_section,
        "word_count": len(draft_text.split())
    })
    
    return {
        "current_draft": {
            "section": current_section.title() if current_section else "General",
            "content": draft_text,
            "status": "pending_review"
        },
        "agent_history": [{
            "agent": "writer",
            "action": "generate_draft",
            "section": current_section,
            "timestamp": None
        }],
        "logs": [
            log_entry,
            {
                "step": "writer",
                "source": "Writer",
                "message": f"✓ Generated {len(draft_text.split())} words for {current_section}",
                "status": "completed",
                "metadata": {
                    "section": current_section,
                    "research_weight": research_weight,
                    "lit_weight": lit_weight
                }
            }
        ]
    }


# ===== REVIEWER NODE (Review Loop Decision Point) =====

async def reviewer_node(state: ResearchState) -> Dict:
    """Critique the draft for quality, tone, and citation accuracy"""
    
    draft = state["current_draft"]
    draft_content = draft.get("content", "")
    
    log_entry = {
        "step": "reviewer",
        "source": "Reviewer",
        "message": "Reviewing draft quality...",
        "status": "processing"
    }
    
    # Review prompt
    prompt = f"""You are a senior academic editor reviewing a draft.

DRAFT:
{draft_content}

Evaluate the draft on:
1. Academic tone and clarity
2. Citation usage (are claims supported?)
3. Flow and coherence
4. Potential hallucinations or unsupported claims

Respond with EITHER:
- "APPROVED" if the draft is good quality
- Or provide specific feedback for revision (2-3 sentences)
"""
    
    review_result = await ai_client.generate_text(prompt, temperature=0.3, use_flash=True)
    
    is_approved = "APPROVED" in review_result.upper()
    
    return {
        "critique_feedback": None if is_approved else review_result,
        "needs_revision": not is_approved,
        "revision_count": state.get("revision_count", 0) + (0 if is_approved else 1),
        "logs": [
            log_entry,
            {
                "step": "reviewer",
                "source": "Reviewer",
                "message": "✓ Approved" if is_approved else f"⚠ Needs revision: {review_result[:100]}...",
                "status": "completed" if is_approved else "warning"
            }
        ]
    }


# ===== RAG RESPONSE NODE (Grounded Answer Generation) =====

async def rag_response_node(state: ResearchState) -> Dict:
    """
    Generate a response grounded in the found papers.
    
    CONTEXT SHELF PRIORITY:
    1. First check user's library (selected_paper_ids) - the "Context Shelf"
    2. Only use ArXiv/Scholar results if library has no relevant content
    """
    query = state["query"]
    project_id = state["project_id"]
    selected_paper_ids = state.get("selected_paper_ids", [])
    ranked_papers = state.get("ranked_papers", [])
    found_papers = state.get("found_papers", [])
    
    logs = []
    library_context = None
    library_papers_info = []
    
    # ===== STEP 0: RETRIEVE UNIFIED PROJECT MEMORY (Chat History) =====
    memory_context = []
    try:
        # Search for past relevant chat interactions (Unified Memory)
        chat_results = await vector_store.search_similar(
            project_id=project_id,
            query=query,
            top_k=3,  # Get top 3 conversaton snippets
            include_metadata=True
        )
        
        for res in chat_results:
            # Only include if it's a chat log
            if res.get("type") == "chat":
                 memory_context.append(f"Previously discussed: {res.get('text')}")
                 
        if memory_context:
            logs.append({
                "step": "rag_response",
                "source": "UnifiedMemory",
                "message": f"🧠 Recalled {len(memory_context)} relevant past interactions",
                "status": "completed"
            })
    except Exception as mem_err:
        print(f"Memory retrieval warning: {mem_err}")

    # ===== STEP 1: CHECK CONTEXT SHELF FIRST =====
    if selected_paper_ids:
        log_entry = {
            "step": "rag_response",
            "source": "ContextShelf",
            "message": f"📚 Scanning your library ({len(selected_paper_ids)} papers)...",
            "status": "processing"
        }
        logs.append(log_entry)
        
        # Search user's library for relevant chunks WITH METADATA (Page numbers!)
        try:
            context_results = await vector_store.search_similar(
                project_id=project_id,
                query=query,
                paper_ids=selected_paper_ids,
                top_k=8,  # Increased context window
                include_metadata=True
            )
            
            if context_results:
                # Get unique paper IDs found
                found_paper_ids = list(set(r.get("paper_id") for r in context_results if r.get("paper_id")))
                
                # Fetch metadata for these papers
                from app.models.database import LibraryItem
                db = next(get_db())
                try:
                    db_papers = db.query(LibraryItem).filter(
                        LibraryItem.id.in_(found_paper_ids)
                    ).all()
                    paper_map = {p.id: p for p in db_papers}
                    
                    # Construct specific chunk objects for the LLM
                    for result in context_results:
                        p_id = result.get("paper_id")
                        paper = paper_map.get(p_id)
                        
                        if paper:
                            library_papers_info.append({
                                "title": paper.title,
                                "authors": paper.authors if isinstance(paper.authors, str) else ", ".join(paper.authors[:3]) if paper.authors else "Unknown",
                                "year": paper.year,
                                "text": result.get("text"),  # Use specific chunk text
                                "page_number": result.get("page_number"),  # Use page number!
                                "source": "User Library",
                                "pdf_path": paper.pdf_path,
                                "paperId": p_id
                            })
                            
                    library_context = True # Flag that we found stuff
                    
                finally:
                    db.close()
                
                logs.append({
                    "step": "rag_response",
                    "source": "ContextShelf",
                    "message": f"✓ Found {len(library_papers_info)} relevant passages in your library",
                    "status": "completed"
                })
        except Exception as e:
            logs.append({
                "step": "rag_response",
                "source": "ContextShelf",
                "message": f"⚠ Library search warning: {str(e)[:50]}",
                "status": "warning"
            })
    
    # ===== STEP 2: DECIDE DATA SOURCE =====
    if library_papers_info:
        # FORCE LIBRARY USE: If we found relevant chunks, strictly use them
        papers_to_use = library_papers_info
        source_type = "library"
        logs.append({
            "step": "rag_response",
            "source": "ResearchAssistant",
            "message": "📖 Answering from YOUR library papers (Shelf Priority Enforced)",
            "status": "processing"
        })
    elif selected_paper_ids:
        # STRICT FALLBACK: User selected papers but we found nothing?
        # Don't switch to ArXiv silently. Be honest.
        return {
            "current_draft": {
                "section": "Response",
                "content": """I searched your selected papers but couldn't find specific information matching your question.

**Suggestions:**
1. Try rephrasing your question.
2. Ensure the relevant papers are selected in the sidebar.
3. If you want to search external papers (ArXiv), simply unselect your library papers or ask me to "Search external sources".""",
                "status": "no_context_found"
            },
            "logs": logs + [{
                "step": "rag_response",
                "source": "ResearchAssistant",
                "message": "⚠ No relevant info found in selected papers",
                "status": "warning"
            }]
        }
    else:
        # Fallback to ArXiv/Scholar results (only if NO shelf papers selected)
        papers_to_use = ranked_papers if ranked_papers else found_papers
        source_type = "external"
        
        if papers_to_use:
            logs.append({
                "step": "rag_response",
                "source": "ResearchAssistant",
                "message": f"🔍 Using {len(papers_to_use)} papers from ArXiv/Scholar",
                "status": "processing"
            })
    
    # ===== STEP 3: CHECK IF WE HAVE ANY PAPERS =====
    if not papers_to_use:
        # No papers found - be honest about it
        return {
            "current_draft": {
                "section": "Response",
                "content": """I couldn't find any relevant papers for your query. 

**What you can do:**
1. **Upload papers** to your library for me to analyze
2. Try rephrasing your question with different keywords
3. Search for specific topics (e.g., "transformer attention mechanism" instead of "how transformers work")

Would you like me to try a different search?""",
                "status": "no_papers"
            },
            "logs": logs + [{
                "step": "rag_response",
                "source": "ResearchAssistant",
                "message": "⚠ No papers found to ground response",
                "status": "warning"
            }]
        }
    
    # Generate grounded response using the found papers
    try:
        result = await generate_grounded_response(
            query=query,
            papers=papers_to_use,
            ai_client=ai_client,
            prompt_type="research",
            research_context="\n\n".join(memory_context) if memory_context else None
        )
        
        response_content = result["response"]
        papers_used = result["papers_used"]
        
        # Add source indicator to response
        source_indicator = "📚 *Answered from your library*" if source_type == "library" else "🔍 *Answered from ArXiv/Scholar*"
        response_with_source = f"{source_indicator}\n\n{response_content}"
        
        return {
            "current_draft": {
                "section": "Research Response",
                "content": response_with_source,
                "status": "grounded",
                "source_type": source_type,
                "papers_used": papers_used,
                "total_papers": len(papers_to_use)
            },
            "papers_to_save": papers_used if source_type == "external" else [],  # Only offer to save external papers
            "logs": logs + [{
                "step": "rag_response",
                "source": "ResearchAssistant",
                "message": f"✓ Generated response grounded in {len(papers_used)} papers ({source_type})",
                "status": "completed",
                "metadata": {
                    "papers_cited": len(papers_used),
                    "total_papers_found": result["total_papers_found"],
                    "source_type": source_type
                }
            }]
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "logs": logs + [{
                "step": "rag_response",
                "source": "ResearchAssistant",
                "message": f"✗ Response generation failed: {str(e)}",
                "status": "error"
            }]
        }
