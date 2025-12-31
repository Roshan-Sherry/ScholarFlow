"""Individual LangGraph node implementations"""

from typing import Dict
from langchain_core.messages import HumanMessage, AIMessage
import httpx
from sqlalchemy.orm import Session

from app.agents.state import ResearchState
from app.core.gemini_client import gemini_client
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
    
    # Classify intent using Gemini
    intent = await gemini_client.classify_intent(query)
    
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
    """Search external APIs for papers"""
    
    query = state.get("refined_query") or state["query"]
    iteration = state.get("search_iteration", 0)
    
    # Log step
    log_entry = {
        "step": "search",
        "source": "Search",
        "message": f"Searching ArXiv for papers (iteration {iteration + 1})...",
        "status": "processing"
    }
    
    try:
        # Call ArXiv API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://export.arxiv.org/api/query",
                params={
                    "search_query": f"all:{query}",
                    "start": 0,
                    "max_results": 10,
                    "sortBy": "relevance",
                    "sortOrder": "descending"
                },
                timeout=10.0
            )
            
            # Simple XML parsing (in production, use feedparser)
            # For now, return mock data
            found_papers = [
                {
                    "title": f"Sample Paper {i} for: {query}",
                    "authors": ["Author A", "Author B"],
                    "year": 2024,
                    "abstract": f"This paper discusses {query} with novel approaches...",
                    "arxiv_id": f"2024.0000{i}",
                    "url": f"https://arxiv.org/abs/2024.0000{i}"
                }
                for i in range(1, 6)
            ]
        
        return {
            "found_papers": found_papers,
            "search_iteration": iteration + 1,
            "logs": [
                log_entry,
                {
                    "step": "search",
                    "source": "Search",
                    "message": f"✓ Found {len(found_papers)} papers",
                    "status": "completed",
                    "metadata": {"count": len(found_papers)}
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
        # Score using Gemini
        score = await gemini_client.score_paper_relevance(
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
    
    # Use Gemini to suggest refinement
    prompt = f"""The search query "{original_query}" returned no relevant papers.
Suggest a refined, more specific search query that might yield better results.
Return ONLY the refined query, nothing else."""
    
    refined = await gemini_client.generate_text(prompt, temperature=0.7, use_flash=True)
    
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
                # Analyze with Gemini Vision
                if not asset.ai_description:
                    description = await gemini_client.analyze_image(
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
    """Generate academic text with citations"""
    
    query = state["query"]
    selected_paper_ids = state["selected_paper_ids"]
    lab_descriptions = state.get("lab_asset_descriptions", [])
    revision_count = state.get("revision_count", 0)
    critique = state.get("critique_feedback")
    
    log_entry = {
        "step": "writer",
        "source": "Writer",
        "message": f"Drafting content (revision {revision_count})...",
        "status": "processing"
    }
    
    # Retrieve paper context from vector store
    context_chunks = []
    if selected_paper_ids:
        project_id = state["project_id"]
        context_chunks = await vector_store.search_similar(
            project_id,
            query,
            paper_ids=selected_paper_ids,
            top_k=5
        )
    
    # Build prompt
    context_text = "\n\n".join(context_chunks) if context_chunks else "No papers selected."
    lab_context = "\n".join(lab_descriptions) if lab_descriptions else ""
    
    revision_instruction = ""
    if critique:
        revision_instruction = f"\n\nPREVIOUS FEEDBACK:\n{critique}\n\nPlease address this feedback in your revision."
    
    prompt = f"""You are an academic co-author writing high-quality research prose.

USER REQUEST: {query}

SOURCE MATERIAL:
{context_text}

LAB DATA:
{lab_context}
{revision_instruction}

Write 2-4 paragraphs of academic text in a scholarly tone.
Use numerical citations like [1], [2] when referencing papers.
DO NOT include section headers, just the body text.
"""
    
    # Generate text
    draft_text = await gemini_client.generate_text(prompt, temperature=0.7)
    
    return {
        "current_draft": {
            "section": "Response",
            "content": draft_text,
            "status": "pending_review"
        },
        "logs": [
            log_entry,
            {
                "step": "writer",
                "source": "Writer",
                "message": f"✓ Generated {len(draft_text.split())} words",
                "status": "completed"
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
    
    review_result = await gemini_client.generate_text(prompt, temperature=0.3, use_flash=True)
    
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
