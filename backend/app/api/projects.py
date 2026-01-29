"""Project management API endpoints"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.models.database import Project, get_db
from app.models.schemas import ProjectCreate, ProjectResponse
from pydantic import BaseModel

router = APIRouter(prefix="/projects", tags=["projects"])


class GenerateProjectRequest(BaseModel):
    paper_ids: List[str]


@router.post("/generate", response_model=ProjectResponse)
async def generate_project(
    request: GenerateProjectRequest,
    db: Session = Depends(get_db)
):
    """Generate a new project (Lit Review) from selected papers using the Planner Agent"""
    from app.agents.graph import planner_node
    from app.models.database import ProjectPhase
    
    # 1. Fetch Papers from existing library or prepare for import
    from app.models.database import LibraryItem
    
    papers = db.query(LibraryItem).filter(LibraryItem.id.in_(request.paper_ids)).all()
    
    # 2. Run Planner Node
    # Construct state with real paper context
    # We ideally pass paper metadata to the planner
    paper_context = "\n".join([f"- {p.title}: {p.abstract[:200]}..." for p in papers])
    
    mock_state = {
        "query": f"Generate a comprehensive literature review outline for these papers:\n{paper_context}",
        "selected_paper_ids": request.paper_ids,
        "lab_asset_ids": []
    }
    
    result = await planner_node(mock_state)
    outline = result.get("current_draft", {}).get("outline", "# New Research Plan")
    
    # 3. Create Project
    title = f"Lit Review: Authorization & Analysis ({len(request.paper_ids)} papers)" 
    # Logic to extract better title from outline could go here
    
    db_project = Project(
        title=title,
        description=f"Automated literature review based on {len(request.paper_ids)} sources.\n\nGenerated Plan:\n{outline[:200]}...",
        mode="RESEARCH",
        findings=outline, # Store full outline in findings or a new column
        current_phase=ProjectPhase.PLANNING
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # 4. Copy papers to new project's library
    for paper in papers:
        # Create a copy of the paper associated with the new project
        new_library_item = LibraryItem(
            project_id=db_project.id,
            title=paper.title,
            authors=paper.authors,
            year=paper.year,
            abstract=paper.abstract,
            pdf_path=paper.pdf_path,
            arxiv_id=paper.arxiv_id,
            doi=paper.doi,
            url=paper.url,
            is_selected_for_context=True,  # Select for context by default
            chunk_count=paper.chunk_count
        )
        db.add(new_library_item)
    
    db.commit()
    db.refresh(db_project)
    
    return db_project


@router.post("", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db)
):
    """Create a new research project"""
    
    db_project = Project(
        title=project.title,
        description=project.description,
        mode=project.mode.value,
        methodology=project.methodology,
        findings=project.findings
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return db_project


@router.get("", response_model=List[ProjectResponse])
async def list_projects(db: Session = Depends(get_db)):
    """Get all projects"""
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    return projects


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get project by ID"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Delete a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db.delete(project)
    db.commit()
    
    return {"message": "Project deleted successfully"}
