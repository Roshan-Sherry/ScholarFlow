"""FAISS vector store service for document embeddings and similarity search"""

from pathlib import Path
from typing import List, Optional
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.database import LibraryItem


class VectorStoreService:
    """FAISS-based vector store for document chunks"""
    
    def __init__(self):
        # Initialize embedding model
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        self.dimension = 384  # Dimension for all-MiniLM-L6-v2
    
    def _get_index_path(self, project_id: str) -> Path:
        """Get path to project's FAISS index"""
        return settings.faiss_index_path / f"{project_id}.index"
    
    def _get_metadata_path(self, project_id: str) -> Path:
        """Get path to project's chunk metadata"""
        return settings.faiss_index_path / f"{project_id}_metadata.npy"
    
    def create_index(
        self,
        project_id: str,
        chunks: List[str],
        paper_ids: List[str]
    ) -> str:
        """Create or update FAISS index for project
        
        Args:
            project_id: Project ID
            chunks: List of text chunks
            paper_ids: Corresponding paper IDs for each chunk
            
        Returns:
            Path to saved index
        """
        
        # Generate embeddings
        embeddings = self.embedding_model.encode(chunks, show_progress_bar=False)
        embeddings = np.array(embeddings).astype('float32')
        
        # Create FAISS index
        index = faiss.IndexFlatL2(self.dimension)
        index.add(embeddings)
        
        # Save index
        index_path = self._get_index_path(project_id)
        faiss.write_index(index, str(index_path))
        
        # Save metadata (chunk text + paper IDs)
        metadata = np.array([
            {"chunk": chunk, "paper_id": paper_id}
            for chunk, paper_id in zip(chunks, paper_ids)
        ])
        metadata_path = self._get_metadata_path(project_id)
        np.save(metadata_path, metadata)
        
        return str(index_path)
    
    async def search_similar(
        self,
        project_id: str,
        query: str,
        paper_ids: Optional[List[str]] = None,
        top_k: int = 5
    ) -> List[str]:
        """Search for similar chunks in project's vector store
        
        Args:
            project_id: Project ID
            query: Search query
            paper_ids: Optional filter to specific papers
            top_k: Number of results to return
            
        Returns:
            List of relevant text chunks
        """
        
        index_path = self._get_index_path(project_id)
        metadata_path = self._get_metadata_path(project_id)
        
        # Check if index exists
        if not index_path.exists():
            return []
        
        # Load index and metadata
        index = faiss.read_index(str(index_path))
        metadata = np.load(metadata_path, allow_pickle=True)
        
        # Encode query
        query_embedding = self.embedding_model.encode([query])
        query_embedding = np.array(query_embedding).astype('float32')
        
        # Search
        distances, indices = index.search(query_embedding, min(top_k * 2, len(metadata)))
        
        # Filter by paper IDs if provided
        results = []
        for idx in indices[0]:
            if idx < len(metadata):
                chunk_meta = metadata[idx].item()
                
                # Filter by paper IDs if specified
                if paper_ids and chunk_meta["paper_id"] not in paper_ids:
                    continue
                
                results.append(chunk_meta["chunk"])
                
                if len(results) >= top_k:
                    break
        
        return results
    
    def add_document_chunks(
        self,
        project_id: str,
        paper_id: str,
        chunks: List[str]
    ):
        """Add chunks from a new document to existing index"""
        
        index_path = self._get_index_path(project_id)
        metadata_path = self._get_metadata_path(project_id)
        
        # Load existing or create new
        if index_path.exists():
            index = faiss.read_index(str(index_path))
            metadata = list(np.load(metadata_path, allow_pickle=True))
        else:
            index = faiss.IndexFlatL2(self.dimension)
            metadata = []
        
        # Encode new chunks
        embeddings = self.embedding_model.encode(chunks, show_progress_bar=False)
        embeddings = np.array(embeddings).astype('float32')
        
        # Add to index
        index.add(embeddings)
        
        # Add metadata
        for chunk in chunks:
            metadata.append({"chunk": chunk, "paper_id": paper_id})
        
        # Save updated index
        faiss.write_index(index, str(index_path))
        np.save(metadata_path, np.array(metadata))


# Global service instance
vector_store = VectorStoreService()
