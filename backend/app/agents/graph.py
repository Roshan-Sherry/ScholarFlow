"""LangGraph cyclic workflow definition with Discovery and Review loops"""

from typing import Literal
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage

from app.agents.state import ResearchState
from app.agents.nodes import (
    router_node,
    search_node,
    ranker_node,
    refine_query_node,
    lab_analyst_node,
    writer_node,
    reviewer_node,
    rag_response_node
)
from app.core.config import settings


# ===== PLANNER NODE (Added for Outline Generation) =====

async def planner_node(state: ResearchState) -> dict:
    """Generate manuscript outline based on selected papers and assets"""
    from app.core.ai_client import ai_client
    
    query = state["query"]
    selected_paper_ids = state["selected_paper_ids"]
    lab_asset_ids = state.get("lab_asset_ids", [])
    
    log_entry = {
        "step": "planner",
        "source": "Planner",
        "message": "Generating manuscript outline...",
        "status": "processing"
    }
    
    # Build context for outline generation
    prompt = f"""You are a senior academic co-author creating a research paper outline.

USER REQUEST: {query}

AVAILABLE SOURCES: {len(selected_paper_ids)} research papers
AVAILABLE DATA: {len(lab_asset_ids)} lab assets

Create a logical outline with 4-6 sections (e.g., Introduction, Methods, Results, Discussion, Conclusion).
For each section, provide:
- Title
- Brief description (what should be covered)

Return a structured outline."""
    
    outline_text = await ai_client.generate_text(prompt, temperature=0.7)
    
    return {
        "current_draft": {
            "outline": outline_text,
            "status": "outline_generated"
        },
        "logs": [
            log_entry,
            {
                "step": "planner",
                "source": "Planner",
                "message": "✓ Outline generated",
                "status": "completed"
            }
        ]
    }


# ===== CONDITIONAL EDGE FUNCTIONS =====

def route_after_intent(state: ResearchState) -> Literal["search_subgraph", "drafting_subgraph", "lab_analyst", "writer"]:
    """Route based on classified intent"""
    intent = state.get("intent", "CHAT")
    
    if intent == "SEARCH":
        return "search_subgraph"
    elif intent == "DRAFT":
        return "drafting_subgraph"
    elif intent == "ANALYZE":
        return "lab_analyst"
    else:
        # Default to writer for CHAT
        return "writer"


def should_refine_search(state: ResearchState) -> Literal["refine_query", "save_to_context"]:
    """Discovery Loop: Check if papers meet relevance threshold
    
    If top score < threshold AND iterations < max: refine and retry
    Otherwise: save and continue
    """
    ranked_papers = state.get("ranked_papers", [])
    iteration = state.get("search_iteration", 0)
    
    if not ranked_papers:
        # No papers found - refine if under iteration limit
        if iteration < settings.max_search_iterations:
            return "refine_query"
        return "save_to_context"
    
    top_score = ranked_papers[0].get("relevance_score", 0.0)
    
    # If below threshold and can still iterate
    if top_score < settings.relevance_threshold and iteration < settings.max_search_iterations:
        return "refine_query"
    
    return "save_to_context"


def should_revise_draft(state: ResearchState) -> Literal["writer", "reviewer_approved"]:
    """Review Loop: Check if draft needs revision
    
    If needs_revision AND revisions < max: return to writer
    Otherwise: approve and end
    """
    needs_revision = state.get("needs_revision", False)
    revision_count = state.get("revision_count", 0)
    
    if needs_revision and revision_count < settings.max_revision_iterations:
        return "writer"
    
    return "reviewer_approved"


def save_papers_to_context(state: ResearchState) -> dict:
    """Save ranked papers to database and mark for context"""
    from app.models.database import LibraryItem, get_db
    
    ranked_papers = state.get("ranked_papers", [])
    project_id = state["project_id"]
    
    db = next(get_db())
    saved_ids = []
    new_count = 0
    
    try:
        for paper in ranked_papers:
            # Check if already exists
            existing = db.query(LibraryItem).filter(
                LibraryItem.project_id == project_id,
                LibraryItem.title == paper["title"]
            ).first()
            
            if not existing:
                library_item = LibraryItem(
                    project_id=project_id,
                    title=paper["title"],
                    authors=paper.get("authors", []),
                    year=paper.get("year"),
                    abstract=paper.get("abstract", ""),
                    arxiv_id=paper.get("arxiv_id"),
                    url=paper.get("url") or paper.get("pdf_url"),
                    relevance_score=paper.get("relevance_score"),
                    is_selected_for_context=True
                )
                db.add(library_item)
                db.commit()
                saved_ids.append(library_item.id)
                new_count += 1
            else:
                saved_ids.append(existing.id)  # Track existing ones too for context
        
        return {
            "selected_paper_ids": state.get("selected_paper_ids", []) + saved_ids,
            "logs": [{
                "step": "save_context",
                "source": "System",
                "message": f"✓ Processed {len(saved_ids)} papers ({new_count} new)",
                "status": "completed"
            }]
        }
    
    finally:
        db.close()


def finalize_draft(state: ResearchState) -> dict:
    """Mark draft as completed after approval"""
    return {
        "current_draft": {
            **state.get("current_draft", {}),
            "status": "completed"
        },
        "logs": [{
            "step": "finalize",
            "source": "System",
            "message": "✓ Draft approved and finalized",
            "status": "completed"
        }]
    }


# ===== MAIN GRAPH DEFINITION =====

def create_research_graph():
    """Create the cyclic LangGraph workflow with conditional edges"""
    
    # Initialize graph
    graph = StateGraph(ResearchState)
    
    # ===== ADD ALL NODES =====
    
    # Entry point
    graph.add_node("router", router_node)
    
    # Discovery SubGraph nodes
    graph.add_node("search", search_node)
    graph.add_node("ranker", ranker_node)
    graph.add_node("refine_query", refine_query_node)
    graph.add_node("save_to_context", save_papers_to_context)
    
    # Lab Analyst
    graph.add_node("lab_analyst", lab_analyst_node)
    
    # RAG Response (grounded answers from papers)
    graph.add_node("rag_response", rag_response_node)
    
    # Drafting SubGraph nodes
    graph.add_node("planner", planner_node)
    graph.add_node("writer", writer_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("reviewer_approved", finalize_draft)
    
    # ===== DEFINE EDGES =====
    
    # Entry point
    graph.set_entry_point("router")
    
    # Router conditional edges (routes to different subgraphs)
    graph.add_conditional_edges(
        "router",
        route_after_intent,
        {
            "search_subgraph": "search",
            "drafting_subgraph": "planner",
            "lab_analyst": "lab_analyst",
            "writer": "writer"
        }
    )
    
    # ===== DISCOVERY SUBGRAPH (with loop) =====
    
    # search -> ranker
    graph.add_edge("search", "ranker")
    
    # ranker -> conditional (DISCOVERY LOOP decision point)
    graph.add_conditional_edges(
        "ranker",
        should_refine_search,
        {
            "refine_query": "refine_query",  # Loop back to refine
            "save_to_context": "save_to_context"  # Exit loop
        }
    )
    
    # refine_query -> search (LOOP BACK)
    graph.add_edge("refine_query", "search")
    
    # save_to_context -> rag_response (generate grounded answer)
    graph.add_edge("save_to_context", "rag_response")
    
    # rag_response -> END (research queries end with grounded response)
    graph.add_edge("rag_response", END)
    
    # ===== LAB ANALYST PATH =====
    
    # lab_analyst -> writer
    graph.add_edge("lab_analyst", "writer")
    
    # ===== DRAFTING SUBGRAPH (with loop) =====
    
    # planner -> writer
    graph.add_edge("planner", "writer")
    
    # writer -> reviewer
    graph.add_edge("writer", "reviewer")
    
    # reviewer -> conditional (REVIEW LOOP decision point)
    graph.add_conditional_edges(
        "reviewer",
        should_revise_draft,
        {
            "writer": "writer",  # Loop back for revision
            "reviewer_approved": "reviewer_approved"  # Exit loop
        }
    )
    
    # reviewer_approved -> END
    graph.add_edge("reviewer_approved", END)
    
    # Compile graph
    return graph.compile()


# ===== GRAPH INSTANCE =====

research_graph = create_research_graph()
