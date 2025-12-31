"""FastAPI application entry point"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.models.database import init_db
from app.api import chat, projects, lab


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    print("🚀 Initializing ScholarFlow Backend...")
    init_db()
    print("✅ Database initialized")
    print(f"📍 FAISS indexes: {settings.faiss_index_path}")
    print(f"📁 Uploads: {settings.upload_path}")
    
    yield
    
    # Shutdown
    print("👋 Shutting down ScholarFlow Backend...")


# Create FastAPI application
app = FastAPI(
    title="ScholarFlow Backend API",
    description="AI-native Research Operating System with LangGraph Multi-Agent Workflows",
    version="0.1.0",
    lifespan=lifespan
)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(projects.router)
app.include_router(lab.router)
app.include_router(chat.router)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ScholarFlow Backend",
        "version": "0.1.0"
    }


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "ScholarFlow Backend API",
        "docs": "/docs",
        "health": "/health",
        "features": {
            "multi_agent_workflows": "LangGraph with cyclic graphs",
            "discovery_loop": "Iterative paper search refinement",
            "review_loop": "Draft revision with AI reviewer",
            "multimodal_analysis": "Gemini Vision for lab assets",
            "vector_store": "FAISS-based RAG",
            "streaming": "Server-Sent Events for real-time updates"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug
    )
