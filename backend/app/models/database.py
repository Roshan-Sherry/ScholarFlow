"""SQLAlchemy database models for persistence"""

from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text, Boolean, ForeignKey, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime
from typing import Optional
import uuid

from app.core.config import settings

# Create database engine
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency for database sessions"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Project(Base):
    """Research project (isolation context for RAG and chat history)"""
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    mode = Column(String(50), nullable=False)  # RESEARCH | MANUSCRIPT
    
    # Optional context fields
    methodology = Column(Text, nullable=True)
    findings = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    library_items = relationship("LibraryItem", back_populates="project", cascade="all, delete-orphan")
    lab_assets = relationship("LabAsset", back_populates="project", cascade="all, delete-orphan")
    drafts = relationship("Draft", back_populates="project", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="project", cascade="all, delete-orphan")


class LibraryItem(Base):
    """PDF documents in project library (vector-indexed)"""
    __tablename__ = "library_items"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    
    # Paper metadata
    title = Column(String(500), nullable=False)
    authors = Column(JSON)  # List of author names
    year = Column(Integer, nullable=True)
    abstract = Column(Text)
    
    # File and vector storage
    pdf_path = Column(String(500), nullable=True)
    vector_id = Column(String(100), nullable=True)  # Reference to FAISS index
    chunk_count = Column(Integer, default=0)
    
    # RAG context control
    is_selected_for_context = Column(Boolean, default=True)
    relevance_score = Column(Float, nullable=True)  # From ranking agent
    
    # External IDs
    arxiv_id = Column(String(100), nullable=True)
    doi = Column(String(200), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="library_items")


class LabAsset(Base):
    """Multimodal assets (images, CSV) with AI-generated descriptions"""
    __tablename__ = "lab_assets"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    asset_type = Column(String(50), nullable=False)  # image | data | code
    file_path = Column(String(500), nullable=False)
    
    # AI-generated description (from Gemini Vision for images)
    ai_description = Column(Text, nullable=True)
    
    # Metadata
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="lab_assets")


class Draft(Base):
    """Manuscript drafts with structured content blocks"""
    __tablename__ = "drafts"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    
    # Content stored as JSON blocks
    content_blocks = Column(JSON)  # [{section: "Intro", text: "...", status: "completed"}]
    
    # Bibliography tracking
    bibliography = Column(JSON)  # [{key: "smith2020", bibtex: "..."}]
    
    # Draft metadata
    word_count = Column(Integer, default=0)
    revision_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="drafts")


class ChatSession(Base):
    """Chat history for a project"""
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    
    # Messages stored as JSON
    messages = Column(JSON)  # [{role: "user", content: "..."}, {role: "assistant", content: "..."}]
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="chat_sessions")


# Create all tables
def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("✅ Database initialized successfully")
