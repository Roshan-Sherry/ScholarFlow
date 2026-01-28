"""Chat and workflow streaming endpoints with Server-Sent Events"""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json
import asyncio

from app.models.schemas import ChatRequest, WorkflowStepLog
from app.models.database import get_db
from app.agents.graph import research_graph
from app.agents.state import create_initial_state

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream_workflow(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """Stream LangGraph workflow execution with SSE
    
    This endpoint runs the multi-agent workflow and streams
    intermediate steps as Server-Sent Events for real-time UI updates.
    """
    
    async def event_generator():
        """Generator function for SSE events"""
        
        try:
            # Create initial state
            initial_state = create_initial_state(
                query=request.message,
                project_id=request.project_id,
                selected_paper_ids=request.selected_paper_ids,
                lab_asset_ids=request.lab_asset_ids,
                research_asset_ids=request.research_asset_ids,  # NEW
                current_section=request.current_section  # NEW
            )
            
            # Send start event
            yield f"data: {json.dumps({'type': 'start', 'message': 'Workflow initiated'})}\n\n"
            
            # Track final state
            final_response = ""
            final_papers = []

            # Stream graph execution
            async for chunk in research_graph.astream(initial_state):
                # LangGraph astream yields {node_name: state_update} by default
                should_break_outer_loop = False
                for node_name, state_update in chunk.items():
                    # DEBUG: Log state keys
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.info(f"Update from node: {node_name}")
                    logger.info(f"Intent: {state_update.get('intent')}, Found papers: {len(state_update.get('found_papers', []))}, Ranked: {len(state_update.get('ranked_papers', []))}")
                    
                    # Extract logs from state update
                    logs = state_update.get("logs", [])
                    
                    # Capture papers (prefer ranked, fallback to found)
                    if state_update.get("ranked_papers"):
                        final_papers = state_update["ranked_papers"]
                        logger.info(f"Captured {len(final_papers)} ranked papers")
                    elif state_update.get("found_papers") and not final_papers:
                        final_papers = state_update["found_papers"]
                        logger.info(f"Captured {len(final_papers)} found papers")

                    # Stream each log entry
                    for log in logs:
                        event_data = {
                            "type": "log",
                            "data": log
                        }
                        yield f"data: {json.dumps(event_data)}\n\n"
                        
                        # Small delay for UI processing
                        await asyncio.sleep(0.05)
                    
                    # If draft is being generated, stream content
                    current_draft = state_update.get("current_draft", {})
                    if current_draft and current_draft.get("content"):
                        content = current_draft["content"]
                        final_response = content # Update final response
                        logger.info(f"Captured draft content: {len(content)} chars")
                        
                        text_event = {
                            "type": "text",
                            "data": content
                        }
                        yield f"data: {json.dumps(text_event)}\n\n"
                    
                    # Check for completion
                    if current_draft.get("status") == "completed":
                        logger.info("Draft marked as completed, breaking loop")
                        should_break_outer_loop = True
                        break # Break from inner loop
                    
                    # Check for errors
                    if state_update.get("error"):
                        error_event = {
                            "type": "error",
                            "message": state_update["error"]
                        }
                        yield f"data: {json.dumps(error_event)}\n\n"
                        should_break_outer_loop = True
                        break # Break from inner loop
                
                if should_break_outer_loop:
                    break # Break from outer loop
            
            logger.info(f"FINAL STATE: response={bool(final_response)}, papers={len(final_papers)}")
            
            # Send completion event with final data
            # Wrap answer in structure for frontend compatibility
            formatted_answer = {
                "summary": final_response,
                "confidence": "high",
                "notes": "Generated via ScholarFlow"
            } if final_response else None

            complete_event = {
                'type': 'complete', 
                'message': 'Workflow completed',
                'answer': formatted_answer,
                'papers': final_papers[:5]
            }
            yield f"data: {json.dumps(complete_event)}\n\n"
        
        except Exception as e:
            error_event = {
                "type": "error",
                "message": f"Workflow error: {str(e)}"
            }
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable buffering in nginx
        }
    )


@router.post("/draft-section")
async def draft_section_stream(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """Stream section drafting with Writer -> Reviewer loop
    
    This is a specialized endpoint for the Studio mode drafting workflow.
    """
    
    async def draft_generator():
        """Generator for streaming draft text"""
        
        from app.core.ai_client import ai_client
        from app.services.vector_store import vector_store
        
        # Get context
        context_chunks = []
        if request.selected_paper_ids:
            context_chunks = await vector_store.search_similar(
                request.project_id,
                request.message,
                paper_ids=request.selected_paper_ids,
                top_k=5
            )
        
        context_text = "\n\n".join(context_chunks)
        
        prompt = f"""You are an academic co-author.

USER REQUEST: {request.message}

SOURCE MATERIAL:
{context_text}

Write 2-4 paragraphs of scholarly text with citations [1], [2] where appropriate.
"""
        
        # Stream generation
        yield f"data: {json.dumps({'type': 'start', 'message': 'Drafting section...'})}\n\n"
        
        accumulated_text = ""
        async for chunk in ai_client.generate_text_stream(prompt):
            accumulated_text += chunk
            yield f"data: {json.dumps({'type': 'text_chunk', 'data': chunk})}\n\n"
            await asyncio.sleep(0.02)
        
        yield f"data: {json.dumps({'type': 'complete', 'data': accumulated_text})}\n\n"
    
    return StreamingResponse(
        draft_generator(),
        media_type="text/event-stream"
    )
