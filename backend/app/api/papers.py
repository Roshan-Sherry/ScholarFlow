"""Paper management and upload API"""
import os
import shutil
import fitz  # PyMuPDF
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from pathlib import Path
import os

from app.models.database import get_db, LibraryItem, Project
from app.models.schemas import LibraryItemResponse, PaperSearchResponse, PaperSearchResult
from app.services.vector_store import vector_store
from app.services.paper_search import search_all_sources
from app.core.config import settings
import logging

router = APIRouter(prefix="/papers", tags=["papers"])
logger = logging.getLogger(__name__)

# Ensure upload directory exists
UPLOAD_DIR = settings.upload_path
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
logger.info(f"Upload directory checked: {UPLOAD_DIR}")


@router.get("/search", response_model=PaperSearchResponse)
async def search_papers(
    query: str,
    max_results: int = 10
):
    """
    Search for papers from ArXiv and Semantic Scholar
    
    Args:
        query: Search query
        max_results: Maximum number of results to return (default: 10)
    
    Returns:
        PaperSearchResponse with list of papers and metadata
    """
    try:
        # Search using the multi-source search service
        papers = search_all_sources(query, max_results_per_source=max_results // 2)
        
        # Transform to PaperSearchResult schema
        results = []
        for paper in papers:
            results.append(PaperSearchResult(
                title=paper.get('title', ''),
                authors=paper.get('authors', []),
                year=paper.get('year'),
                abstract=paper.get('abstract') or paper.get('summary', ''),
                url=paper.get('url') or paper.get('pdf_url'),
                arxiv_id=paper.get('arxiv_id'),
                doi=paper.get('doi'),
                relevance_score=paper.get('citation_count', 0) / 1000.0 if paper.get('citation_count') else None
            ))
        
        return PaperSearchResponse(
            results=results,
            total_count=len(results),
            source="arxiv+semantic_scholar"
        )
        
    except Exception as e:
        logger.error(f"Error in paper search: {e}", exc_info=True)
        # Return empty results instead of failing
        return PaperSearchResponse(
            results=[],
            total_count=0,
            source="error"
        )


@router.get("/{paper_id}", response_model=LibraryItemResponse)
async def get_paper(
    paper_id: str,
    db: Session = Depends(get_db)
):
    """Get paper details by ID"""
    paper = db.query(LibraryItem).filter(LibraryItem.id == paper_id).first()
    if not paper:
        # Check if it's a mock ID, if so, handled by frontend, but 404 here
        raise HTTPException(status_code=404, detail="Paper not found")
        
    # Return path relative to mount for frontend usage if needed, 
    # but LibraryItemResponse has pdf_path. 
    # We might want to normalize it for the frontend.
    # The frontend will construction /uploads/{filename} based on pdf_path.
    return paper

def process_pdf_background(
    file_path: Path,
    paper_id: str,
    project_id: str,
    db_session_factory
):
    """Refined PDF processing in background"""
    db = db_session_factory()
    try:
        # 1. Extract Text
        doc = fitz.open(file_path)
        full_text = ""
        chunks = []
        
        # Simple chunking strategy (per page or fixed size)
        # For better RAG, we'd want overlapping windows, but per-page is a good start
        for page_num, page in enumerate(doc):
            text = page.get_text()
            full_text += text
            
            # Create chunks (approx 1000 chars)
            # This is naive; assumes text extraction is clean
            page_chunks = [text[i:i+1000] for i in range(0, len(text), 1000)]
            if not page_chunks:
                page_chunks = ["NO TEXT FOUND ON PAGE"]
                
            chunks.extend(page_chunks)
            
        doc.close()
        
        # 2. Update Database Record
        paper = db.query(LibraryItem).filter(LibraryItem.id == paper_id).first()
        if paper:
            paper.chunk_count = len(chunks)
            # paper.abstract = full_text[:500] + "..." # Optional: Auto-generate abstract
            db.commit()
            
        # 3. Vector Indexing
        if chunks:
            vector_store.add_document_chunks(
                project_id=project_id,
                paper_id=paper_id,
                chunks=chunks
            )
            
    except Exception as e:
        logger.error(f"Error processing PDF {paper_id}: {e}", exc_info=True)
    finally:
        db.close()


@router.post("/upload", response_model=LibraryItemResponse)
async def upload_paper(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Upload PDF, parse text, and index for RAG"""
    
    # Validation
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Save File
    file_id = f"{project_id}_{int(datetime.now().timestamp())}"
    safe_filename = file.filename.replace(" ", "_").replace("/", "_")
    file_path = UPLOAD_DIR / f"{file_id}_{safe_filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Create DB Entry
    new_paper = LibraryItem(
        project_id=project_id,
        title=file.filename.replace('.pdf', '').replace('_', ' ').title(),
        authors=["Unknown"], # Placeholder until we parse metadata
        year=datetime.now().year,
        abstract="Processing...",
        pdf_path=str(file_path),
        chunk_count=0,
        is_selected_for_context=True
    )
    
    db.add(new_paper)
    db.commit()
    db.refresh(new_paper)
    
    # Trigger Background Processing (avoid blocking response)
    # Pass session factory, not session, to background task
    from app.models.database import SessionLocal
    background_tasks.add_task(
        process_pdf_background, 
        file_path, 
        new_paper.id, 
        project_id, 
        SessionLocal
    )
    
    return new_paper
