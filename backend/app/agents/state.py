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
    
    # Lab context (legacy - kept for backward compatibility)
    lab_asset_ids: List[str]
    lab_asset_descriptions: List[str]  # AI-generated descriptions
    
    # NEW: Student's research assets (experimental data, figures, etc.)
    research_asset_ids: List[str]  # Student's OWN research artifacts
    research_asset_descriptions: List[str]  # AI analysis of student's data
    
    # Drafting workflow state
    current_draft: Dict  # {section: str, content: str, status: str}
    current_section: Optional[str]  # NEW: Which section is being drafted (introduction, methods, results, etc.)
    critique_feedback: Optional[str]  # From reviewer agent
    revision_count: int  # Track revision loops
    needs_revision: bool  # Flag for conditional edge
    
    # Intent routing
    intent: Optional[str]  # "SEARCH" | "CHAT" | "DRAFT" | "ANALYZE"
    
    # Workflow logs (for SSE streaming to frontend)
    logs: Annotated[List[Dict], operator.add]
    
    # RAG Response state
    papers_to_save: List[Dict]  # Papers cited in response, offered for library saving
    
    # Error handling
    error: Optional[str]
    
    # === MULTI-AGENT SYSTEM EXTENSIONS ===
    
    # Agent coordination
    active_agent: Optional[str]  # Current agent handling the request
    agent_history: Annotated[List[Dict], operator.add]  # Track agent handoffs and decisions
    supervisor_decision: Optional[Dict]  # Supervisor's routing and reasoning
    
    # Memory system
    conversation_memory: List[Dict]  # Structured conversation history
    research_insights: Dict  # Key findings, methodologies, gaps
    user_preferences: Dict  # Writing style, citation format, etc.
    
    # Citation management
    citations_used: Dict  # paper_id -> citation_number mapping
    bibliography: List[Dict]  # Formatted references
    citation_suggestions: List[Dict]  # Proactive citation recommendations
    
    # Proactive suggestions
    next_actions: List[Dict]  # Suggested next steps for user
    quality_feedback: Optional[Dict]  # Draft quality analysis
    
    # Synthesis and insights
    synthesis_summary: Optional[str]  # Multi-paper synthesis
    comparative_analysis: Optional[Dict]  # Paper comparisons
    
    # === NON-LINEAR WORKFLOW EXTENSIONS ===
    
    # Message bus for agent-to-agent communication
    agent_messages: Annotated[List[Dict], operator.add]  # Inter-agent messages
    
    # Workflow state management
    workflow_state: Optional[str]  # "running" | "paused" | "complete" | "stuck"
    routing_history: Annotated[List[Dict], operator.add]  # Track routing decisions
    
    # Parallel execution tracking
    parallel_tasks: List[Dict]  # Tasks running in parallel
    completed_tasks: List[str]  # Completed task IDs
    
    # Dynamic re-routing
    reroute_requested: bool  # Flag to trigger re-routing
    reroute_reason: Optional[str]  # Why re-routing is needed
    suggested_next_agent: Optional[str]  # Suggested agent for re-route


def create_initial_state(
    query: str,
    project_id: str,
    selected_paper_ids: List[str] = None,
    lab_asset_ids: List[str] = None,
    research_asset_ids: List[str] = None,  # NEW
    current_section: str = None  # NEW
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
        "research_asset_ids": research_asset_ids or [],  # NEW
        "research_asset_descriptions": [],  # NEW
        "current_draft": {},
        "current_section": current_section,  # NEW
        "critique_feedback": None,
        "revision_count": 0,
        "needs_revision": False,
        "intent": None,
        "logs": [],
        "papers_to_save": [],  # Papers cited in response
        "error": None,
        # Multi-agent system initial state
        "active_agent": None,
        "agent_history": [],
        "supervisor_decision": None,
        "conversation_memory": [],
        "research_insights": {},
        "user_preferences": {},
        "citations_used": {},
        "bibliography": [],
        "citation_suggestions": [],
        "next_actions": [],
        "quality_feedback": None,
        "synthesis_summary": None,
        "comparative_analysis": None,
        # Non-linear workflow extensions
        "agent_messages": [],
        "workflow_state": "running",
        "routing_history": [],
        "parallel_tasks": [],
        "completed_tasks": [],
        "reroute_requested": False,
        "reroute_reason": None,
        "suggested_next_agent": None,
        "supervisor_decision": None,
        "conversation_memory": [],
        "research_insights": {"key_findings": [], "methodologies": [], "gaps_identified": []},
        "user_preferences": {"citation_style": "IEEE", "writing_tone": "academic"},
        "citations_used": {},
        "bibliography": [],
        "citation_suggestions": [],
        "next_actions": [],
        "quality_feedback": None,
        "synthesis_summary": None,
        "comparative_analysis": None
    }


