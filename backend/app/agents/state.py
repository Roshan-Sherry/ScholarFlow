"""LangGraph shared state definition for workflow orchestration"""

from typing import TypedDict, List, Dict, Optional, Annotated
from langchain_core.messages import BaseMessage
import operator


class ResearchState(TypedDict):
    """Shared state for the research workflow graph
    
    This state is passed through all nodes in the LangGraph workflow
    and accumulates information as the workflow progresses.
    """
    
    # Core conversation
    messages: Annotated[List[BaseMessage], operator.add]
    
    # User input
    query: str
    project_id: str
    
    # Discovery workflow state
    found_papers: List[Dict]  # Papers from search APIs
    ranked_papers: List[Dict]  # Papers after ranking
    selected_paper_ids: List[str]  # User-selected papers for context
    search_iteration: int  # Track refinement loops
    refined_query: Optional[str]  # Modified query for retry
    
    # Lab context
    lab_asset_ids: List[str]
    lab_asset_descriptions: List[str]  # AI-generated descriptions
    
    # Drafting workflow state
    current_draft: Dict  # {section: str, content: str, status: str}
    critique_feedback: Optional[str]  # From reviewer agent
    revision_count: int  # Track revision loops
    needs_revision: bool  # Flag for conditional edge
    
    # Intent routing
    intent: Optional[str]  # "SEARCH" | "CHAT" | "DRAFT" | "ANALYZE"
    
    # Workflow logs (for SSE streaming to frontend)
    logs: Annotated[List[Dict], operator.add]
    
    # Error handling
    error: Optional[str]


def create_initial_state(
    query: str,
    project_id: str,
    selected_paper_ids: List[str] = None,
    lab_asset_ids: List[str] = None
) -> ResearchState:
    """Factory function to create initial state"""
    return {
        "messages": [],
        "query": query,
        "project_id": project_id,
        "found_papers": [],
        "ranked_papers": [],
        "selected_paper_ids": selected_paper_ids or [],
        "search_iteration": 0,
        "refined_query": None,
        "lab_asset_ids": lab_asset_ids or [],
        "lab_asset_descriptions": [],
        "current_draft": {},
        "critique_feedback": None,
        "revision_count": 0,
        "needs_revision": False,
        "intent": None,
        "logs": [],
        "error": None
    }
