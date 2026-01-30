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
                    
                    # NEW: Send 'found' event with papers for frontend display
                    if state_update.get("found_papers") or state_update.get("ranked_papers"):
                        papers_to_send = state_update.get("ranked_papers") or state_update.get("found_papers") or []
                        if papers_to_send:
                            # Format papers for frontend
                            formatted_papers = []
                            for paper in papers_to_send[:20]:  # Limit to 20 for UI
                                formatted_papers.append({
                                    "id": paper.get("id") or f"paper-{hash(paper.get('title', ''))}",
                                    "title": paper.get("title", ""),
                                    "authors": paper.get("authors", []),
                                    "year": paper.get("year"),
                                    "summary": paper.get("abstract") or paper.get("summary", ""),
                                    "pdfUrl": paper.get("pdf_url") or paper.get("url"),
                                    "tags": [],
                                    "source": paper.get("source", "unknown")
                                })
                            
                            # Emit found event
                            found_event = {
                                "type": "found",
                                "count": len(formatted_papers),
                                "papers": formatted_papers
                            }
                            yield f"data: {json.dumps(found_event)}\n\n"
                            logger.info(f"Sent 'found' event with {len(formatted_papers)} papers")

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
                    
                    # NEW: Capture synthesis summary (from Synthesis Node)
                    if state_update.get("synthesis_summary"):
                        content = state_update["synthesis_summary"]
                        final_response = content
                        logger.info(f"Captured synthesis: {len(content)} chars")
                        
                        text_event = {
                            "type": "text",
                            "data": content
                        }
                        yield f"data: {json.dumps(text_event)}\n\n"
                        
                    # NEW: Capture proactive suggestions
                    if state_update.get("next_actions"):
                        actions = state_update["next_actions"]
                        # We can send this as a specific event or append to logs
                        # For now, let's verify if we should append to answer or just log
                        logger.info(f"Captured {len(actions)} proactive actions")

                    
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
        
            # Save detailed chat history
            try:
                # Use a new DB session for saving to avoid async/sync conflicts or staleness
                from app.models.database import SessionLocal, ChatSession
                save_db = SessionLocal()
                
                # Check for existing session or create new
                chat_session = save_db.query(ChatSession).filter(
                    ChatSession.project_id == request.project_id
                ).first()
                
                if not chat_session:
                    chat_session = ChatSession(
                        project_id=request.project_id,
                        messages=[]
                    )
                    save_db.add(chat_session)
                
                # Prepare new messages
                new_messages = [
                    {
                        "role": "user", 
                        "content": request.message,
                        "timestamp": str(asyncio.get_event_loop().time()) 
                    },
                    {
                        "role": "assistant", 
                        "content": final_response or "I couldn't generate a response.",
                        "sources": [p['id'] for p in formatted_papers] if final_papers else [],
                        "timestamp": str(asyncio.get_event_loop().time())
                    }
                ]
                
                # Append to existing (need to reassignment for SQLAlchemy JSON mutation detection sometimes)
                current_msgs = list(chat_session.messages) if chat_session.messages else []
                current_msgs.extend(new_messages)
                chat_session.messages = current_msgs
                
                save_db.commit()
                logger.info(f"Saved {len(new_messages)} messages to chat history for project {request.project_id}")
                save_db.close()
                
            except Exception as e:
                logger.error(f"Failed to save chat history: {e}")

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
