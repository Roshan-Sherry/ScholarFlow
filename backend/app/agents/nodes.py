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


# ===== ROUTER NODE =====

async def router_node(state: ResearchState) -> Dict:
    """Classify user intent and route to appropriate subgraph"""
    
    query = state["query"]
    
    # Log step
    log_entry = {
        "step": "router",
        "source": "Router",
        "message": f"Analyzing intent for: '{query[:50]}...'",
        "status": "processing"
    }
    
    # Classify intent using AI
    intent = await ai_client.classify_intent(query)
    
    return {
        "intent": intent,
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
        
        return {
            "found_papers": found_papers,
            "search_iteration": iteration + 1,
            "logs": [
                log_entry,
                thought_log,
                {
                    "step": "search",
                    "source": "MultiSourceSearch",
                    "message": f"✓ Found {len(found_papers)} papers from multiple sources",
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
    """Score papers for relevance using Gemini"""
    
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
                "message": f"✓ Top score: {top_score:.2f} (threshold: {settings.relevance_threshold})",
                "status": "completed",
                "metadata": {
                    "top_score": top_score,
                    "meets_threshold": meets_threshold
                }
            }
        ]
    }


# ===== QUERY REFINER NODE (Discovery Loop Retry) =====

async def refine_query_node(state: ResearchState) -> Dict:
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
    draft_text = await ai_client.generate_text(prompt, temperature=0.7)
    
    return {
        "current_draft": {
            "section": current_section.title() if current_section else "General",
            "content": draft_text,
            "status": "pending_review"
        },
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
