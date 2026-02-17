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
                current_section=request.current_section,  # NEW
                session_id=request.session_id  # NEW
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
                            
                            # NEW: Emit "analyzing" status for avatar narration
                            status_event = {
                                "type": "status",
                                "phase": "analyzing",
                                "message": "Let me analyze these papers and extract the key insights..."
                            }
                            yield f"data: {json.dumps(status_event)}\n\n"

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
                        narration = current_draft.get("narration")  # Avatar's spoken words
                        thinking = current_draft.get("thinking")  # Chain-of-Thought reasoning (optional)
                        final_response = content # Update final response
                        logger.info(f"Captured draft content: {len(content)} chars, narration: {len(narration) if narration else 0} chars, thinking: {len(thinking) if thinking else 0} chars")
                        
                        if not narration:
                            logger.warning(f"⚠️  No narration extracted! Draft keys: {current_draft.keys()}")
                        
                        # OPTIONAL: Stream thinking process if enabled and present
                        from app.core.config import settings
                        if thinking and settings.show_thinking_to_user:
                            thinking_event = {
                                "type": "thinking",
                                "data": thinking
                            }
                            yield f"data: {json.dumps(thinking_event)}\n\n"
                            await asyncio.sleep(0.2)  # Brief pause after thinking
                        
                        # FIRST: Stream avatar narration if present
                        if narration:
                            # Emit narration event for avatar to speak
                            narration_event = {
                                "type": "narration",
                                "data": narration
                            }
                            logger.debug(f"📢 Streaming narration event: {narration[:100]}...")
                            yield f"data: {json.dumps(narration_event)}\n\n"
                            await asyncio.sleep(0.3)  # Brief pause before content
                        else:
                            logger.warning("⚠️  Narration is empty, not streaming narration event")
                        
                        # SECOND: Emit "synthesizing" status AFTER narration
                        synth_event = {
                            "type": "status",
                            "phase": "synthesizing",
                            "message": narration if narration else "Based on what I found, here's the synthesis..."
                        }
                        yield f"data: {json.dumps(synth_event)}\n\n"
                        
                        # THIRD: Stream written content word-by-word
                        words = content.split()
                        for i, word in enumerate(words):
                            chunk = word if i == 0 else f" {word}"
                            text_event = {
                                "type": "text_chunk",
                                "data": chunk
                            }
                            yield f"data: {json.dumps(text_event)}\n\n"
                            await asyncio.sleep(0.005)  # 5ms for faster streaming
                    
                    # NEW: Capture synthesis summary (from Synthesis Node)
                    if state_update.get("synthesis_summary"):
                        content = state_update["synthesis_summary"]
                        final_response = content
                        logger.info(f"Captured synthesis: {len(content)} chars")
                        
                        # Stream word-by-word
                        words = content.split()
                        for i, word in enumerate(words):
                            chunk = word if i == 0 else f" {word}"
                            text_event = {
                                "type": "text_chunk",
                                "data": chunk
                            }
                            yield f"data: {json.dumps(text_event)}\n\n"
                            await asyncio.sleep(0.03)
                        
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
                chat_session = None
                if request.session_id:
                   chat_session = save_db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
                
                # If no specific session requested, or requested one not found (fallback), try finding ANY session for project (legacy)
                # But with multi-chat, we should prioritize creating a NEW one if no ID provided?
                # For backward compatibility, if no session_id, we find the *latest* one or create new.
                if not chat_session:
                    if request.session_id:
                        # Explicit ID requested but not found -> Should likely default to creating new or error.
                        # For robustness, let's create new.
                        pass
                    else:
                        # Legacy fallback: Find latest
                        chat_session = save_db.query(ChatSession).filter(
                             ChatSession.project_id == request.project_id
                        ).order_by(ChatSession.updated_at.desc()).first()

                if not chat_session:
                    chat_session = ChatSession(
                        project_id=request.project_id,
                        title="New Chat",  # Default title
                        messages=[]
                    )
                    save_db.add(chat_session)
                    save_db.commit() # Commit to get ID
                    save_db.refresh(chat_session)
                
                # Prepare new messages
                timestamp = str(asyncio.get_event_loop().time())
                new_messages = [
                    {
                        "role": "user", 
                        "content": request.message,
                        "timestamp": timestamp
                    },
                    {
                        "role": "assistant", 
                        "content": final_response or "I couldn't generate a response.",
                        "sources": [p['id'] for p in formatted_papers] if final_papers else [],
                        "timestamp": timestamp
                    }
                ]
                
                # Append to existing
                current_msgs = list(chat_session.messages) if chat_session.messages else []
                current_msgs.extend(new_messages)
                chat_session.messages = current_msgs
                
                save_db.commit()
                logger.info(f"Saved messages to chat session {chat_session.id}")
                
                # === INDEX FOR UNIFIED MEMORY ===
                try:
                    from app.services.vector_store import vector_store
                    if final_response:
                        vector_store.add_chat_interaction(
                            project_id=request.project_id,
                            session_id=chat_session.id,
                            user_message=request.message,
                            ai_response=final_response
                        )
                        logger.info("Indexed chat interaction for memory")
                except Exception as index_err:
                    logger.error(f"Failed to index chat memory: {index_err}")
                
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
        async for chunk in ai_client.generate_text_stream(prompt, use_flash=True):
            accumulated_text += chunk
            yield f"data: {json.dumps({'type': 'text_chunk', 'data': chunk})}\n\n"
            await asyncio.sleep(0.02)
        
        yield f"data: {json.dumps({'type': 'complete', 'data': accumulated_text})}\n\n"
    
    return StreamingResponse(
        draft_generator(),
        media_type="text/event-stream"
    )
