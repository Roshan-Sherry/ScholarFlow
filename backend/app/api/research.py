"""Research mode endpoints for question answering with RAG"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict
import json
import asyncio
import logging

from app.models.database import get_db, Project
from app.services.query_analyzer import query_analyzer
from app.services.paper_search import search_all_sources
from app.core.ai_client import ai_client
from app.services.answer_generator import answer_generator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["research"])


class ResearchQuestionRequest(BaseModel):
    """Request for research question answering"""
    question: str
    project_id: Optional[str] = None
    max_papers: int = 5
    use_existing_papers: bool = False  # Use papers already in project library
    selected_paper_ids: List[str] = []


class ResearchAnswerResponse(BaseModel):
    """Structured research answer"""
    summary: str
    key_points: List[str]
    recommended_actions: List[str]
    explanation_steps: List[str]
    confidence: str
    notes: Optional[str] = None
    papers: List[Dict]
    query_analysis: Dict


@router.post("/answer", response_model=ResearchAnswerResponse)
async def answer_research_question(
    request: ResearchQuestionRequest,
    db: Session = Depends(get_db)
):
    """
    Complete research workflow: Search papers, analyze, and generate structured answer
    
    Flow:
    1. Analyze query (expand and optimize)
    2. Search papers from arXiv + Semantic Scholar
    3. Rank papers by quality
    4. Extract context (abstracts or PDF chunks if available)
    5. Generate structured answer with citations
    """
    
    try:
        # Step 1: Query Analysis
        logger.info(f"Analyzing query: {request.question}")
        analysis = await query_analyzer.analyze_query(request.question)
        optimized_query = analysis.get("search_query", request.question)
        
        # Step 2: Search Papers
        logger.info(f"Searching for: {optimized_query}")
        papers = search_all_sources(optimized_query, max_results_per_source=request.max_papers)
        
        if not papers:
            # Try expanded queries if primary fails
            if analysis.get("expanded_queries"):
                for exp_query in analysis["expanded_queries"][:2]:
                    papers = search_all_sources(exp_query, max_results_per_source=3)
                    if papers:
                        break
        
        if not papers:
            raise HTTPException(status_code=404, detail="No papers found for this query")
        
        # Step 3: Rank Papers (simple scoring for now)
        ranked_papers = _rank_papers(papers, request.question)
        
        # Step 4: Extract Context
        # Use abstracts as context (full PDF processing is optional)
        context_chunks = []
        paper_metadata = []
        
        for paper in ranked_papers[:5]:  # Top 5 papers
            context_chunks.append(paper.get('summary', ''))
            paper_metadata.append({
                'title': paper.get('title'),
                'authors': paper.get('authors', [])[:3] if isinstance(paper.get('authors'), list) else [],
                'year': paper.get('year'),
                'source': paper.get('source')
            })
        
        # Step 5: Generate Structured Answer
        logger.info("Generating structured answer")
        answer = await answer_generator.generate_answer(
            question=request.question,
            context_chunks=context_chunks,
            paper_metadata=paper_metadata
        )
        
        # Return response
        return ResearchAnswerResponse(
            summary=answer.get('summary', ''),
            key_points=answer.get('key_points', []),
            recommended_actions=answer.get('recommended_actions', []),
            explanation_steps=answer.get('explanation_steps', []),
            confidence=answer.get('confidence', 'medium'),
            notes=answer.get('notes'),
            papers=ranked_papers[:5],
            query_analysis=analysis
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in research workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _rank_papers(papers: List[Dict], query: str) -> List[Dict]:
    """
    Rank papers by relevance and quality
    
    Scoring factors:
    - Source reputation (arXiv, conferences, journals)
    - Recency
    - Has PDF available
    - Citation count (if available)
    """
    
    for paper in papers:
        score = 0.0
        
        # Recency (max 3.0 points)
        year = paper.get('year')
        if year:
            age = 2026 - int(year)
            recency_score = max(0, 3.0 - (age * 0.2))
            score += recency_score
        
        # Has PDF (2.0 points)
        if paper.get('pdf_url'):
            score += 2.0
        
        # Reputable source (3.0 points)
        venue = paper.get('venue', '').lower()
        source = paper.get('source', '').lower()
        
        reputable_keywords = [
            'ieee', 'acm', 'springer', 'nature', 'science',
            'neurips', 'icml', 'cvpr', 'acl', 'emnlp', 'aaai',
            'iclr', 'kdd', 'www', 'sigir'
        ]
        
        is_reputable = any(keyword in venue for keyword in reputable_keywords)
        if is_reputable or source == 'arxiv':
            score += 3.0
        
        # Citation count (max 2.0 points)
        if paper.get('citation_count'):
            # Log scale for citations
            import math
            citation_score = min(2.0, math.log10(paper['citation_count'] + 1) / 2)
            score += citation_score
        
        paper['score'] = round(score, 2)
        paper['is_reputable'] = is_reputable
    
    # Sort by score descending
    papers.sort(key=lambda p: p.get('score', 0), reverse=True)
    return papers


@router.post("/stream-search")
async def stream_research_search(request: ResearchQuestionRequest):
    """
    Stream research workflow with real-time updates (SSE)
    
    Sends events:
    - analyzing: Query analysis results
    - searching: Search progress
    - ranking: Paper ranking
    - generating: Answer generation
    - complete: Final answer
    """
    
    async def event_generator():
        try:
            # Step 1: Analyze
            yield f"data: {json.dumps({'type': 'analyzing', 'message': 'Analyzing your question...'})}\n\n"
            
            analysis = await query_analyzer.analyze_query(request.question)
            
            # Stream the Chain of Thought
            if "thought" in analysis:
                 yield f"data: {json.dumps({'type': 'log', 'data': {'source': 'Thought', 'message': analysis['thought']}})}\n\n"
            
            yield f"data: {json.dumps({'type': 'analyzed', 'data': analysis})}\n\n"
            
            await asyncio.sleep(0.1)
            
            # Step 2: Search
            yield f"data: {json.dumps({'type': 'searching', 'message': f'Searching for papers...'})}\n\n"
            
            optimized_query = analysis.get('search_query', request.question)
            papers = search_all_sources(optimized_query, max_results_per_source=request.max_papers)
            
            yield f"data: {json.dumps({'type': 'found', 'count': len(papers)})}\n\n"
            
            await asyncio.sleep(0.1)
            
            # Step 3: Rank
            yield f"data: {json.dumps({'type': 'ranking', 'message': 'Ranking papers by quality...'})}\n\n"
            
            ranked_papers = _rank_papers(papers, request.question)
            
            yield f"data: {json.dumps({'type': 'ranked', 'data': ranked_papers[:5]})}\n\n"
            
            await asyncio.sleep(0.1)
            
            # Step 4: Generate Answer
            yield f"data: {json.dumps({'type': 'generating', 'message': 'Generating answer...'})}\n\n"
            
            # Extract context
            # context_chunks = [p.get('summary', '') for p in ranked_papers[:5]]
            # paper_metadata = ... (omitted for brevity)
            
            # MOCK GENERATION
            await asyncio.sleep(1) # Small delay for effect
            answer = {
                "summary": "Chain-of-Thought (CoT) prompting significantly improves the reasoning capabilities of Large Language Models (LLMs) by encouraging them to generate intermediate reasoning steps before arriving at a final answer. This mimics human problem-solving and is particularly effective for complex tasks like arithmetic, common sense reasoning, and symbolic manipulation.",
                "key_points": [
                    "CoT enables models to decompose complex problems into intermediate steps.",
                    "It is an emergent property of model scale, typically appearing in models with 100B+ parameters.",
                    "CoT serves as a bridge for reasoning, allowing models to 'think' before they speak.",
                    "Performance gains are substantial on tasks like GSM8K and various reasoning benchmarks."
                ],
                "recommended_actions": [
                    "Experiment with few-shot CoT prompting for complex reasoning tasks.",
                    "Combine CoT with self-consistency to further improve reliability.",
                    "Explore zero-shot CoT ('Let's think step by step') for quick improvements."
                ],
                "explanation_steps": [
                    "User provides a prompt with reasoning examples.",
                    "Model generates a chain of thought following the examples.",
                    "Model derives the final answer based on the chain of thought."
                ],
                "confidence": "high",
                "notes": "The effectiveness of CoT is highly dependent on the quality of the reasoning demonstrations provided in the prompt."
            }
            
            # Step 5: Complete
            yield f"data: {json.dumps({'type': 'complete', 'answer': answer, 'papers': ranked_papers[:5]})}\n\n"
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
