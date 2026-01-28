"""Multi-source paper search with concurrent execution"""

from typing import List, Dict
import concurrent.futures
import logging

from app.services.arxiv_client import arxiv_client
from app.services.semantic_scholar_client import semantic_scholar_client
from app.core.config import settings

logger = logging.getLogger(__name__)


def search_arxiv_wrapper(query: str, max_results: int) -> List[Dict]:
    """Wrapper for ArXiv search with error handling"""
    try:
        results = arxiv_client.search(query, max_results=max_results)
        # Normalize fields to match expected format
        for paper in results:
            paper['source'] = 'arxiv'
            paper['summary'] = paper.get('abstract', '')
            paper['url'] = paper.get('pdf_url', '')
        return results
    except Exception as e:
        logger.error(f"ArXiv search failed: {e}")
        return []


def search_scholar_wrapper(query: str, max_results: int) -> List[Dict]:
    """Wrapper for Semantic Scholar search with error handling"""
    try:
        results = semantic_scholar_client.search(query, limit=max_results)
        # Normalize fields to match expected format
        for paper in results:
            paper['source'] = 'semantic_scholar'
            paper['summary'] = paper.get('abstract', '')
            paper['url'] = paper.get('url', '')
            # Use paper_id as fallback for arxiv_id if not present
            if not paper.get('arxiv_id'):
                paper['arxiv_id'] = paper.get('paper_id')
        return results
    except Exception as e:
        logger.error(f"Semantic Scholar search failed: {e}")
        return []


def search_all_sources(
    query: str,
    max_results_per_source: int = 5
) -> List[Dict]:
    """
    Search papers from multiple sources concurrently
    
    Args:
        query: Search query
        max_results_per_source: Maximum results from each source
    
    Returns:
        Deduplicated list of papers from all sources
    """
    
    # Check if we should use mock mode (for development)
    if getattr(settings, 'mock_ai_responses', False):
        logger.info(f"MOCK MODE: Returning mock papers for query '{query}'")
        return _get_mock_papers()
    
    # Real implementation - search both sources concurrently
    all_papers = []
    
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            # Submit both searches concurrently
            arxiv_future = executor.submit(search_arxiv_wrapper, query, max_results_per_source)
            scholar_future = executor.submit(search_scholar_wrapper, query, max_results_per_source)
            
            # Gather results
            arxiv_papers = arxiv_future.result(timeout=10)
            scholar_papers = scholar_future.result(timeout=10)
            
            all_papers.extend(arxiv_papers)
            all_papers.extend(scholar_papers)
        
        logger.info(f"Found {len(all_papers)} papers total from all sources")
        
    except Exception as e:
        logger.error(f"Error in concurrent search: {e}")
        # Fallback to mock if real search fails
        logger.warning("Falling back to mock results")
        return _get_mock_papers()
    
    # Deduplicate by title (case-insensitive)
    seen_titles = set()
    deduplicated = []
    
    for paper in all_papers:
        title = paper.get('title', '').lower().strip()
        if title and title not in seen_titles:
            seen_titles.add(title)
            deduplicated.append(paper)
    
    logger.info(f"After deduplication: {len(deduplicated)} unique papers")
    
    # Return top results
    return deduplicated[:max_results_per_source * 2]


def _get_mock_papers() -> List[Dict]:
    """Return mock papers for testing/development"""
    return [
        {
            "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
            "summary": "We explore retrieval-augmented generation (RAG) models which retrieve documents from a knowledge store to help generate answers.",
            "abstract": "We explore retrieval-augmented generation (RAG) models which retrieve documents from a knowledge store to help generate answers.",
            "authors": ["Patrick Lewis", "Ethan Perez", "Aleksandra Piktus"],
            "pdf_url": "https://arxiv.org/pdf/2005.11401.pdf",
            "url": "https://arxiv.org/pdf/2005.11401.pdf",
            "source": "arxiv",
            "year": 2020,
            "venue": "NeurIPS",
            "arxiv_id": "2005.11401",
            "citation_count": 1500
        },
        {
            "title": "Attention Is All You Need",
            "summary": "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
            "abstract": "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
            "authors": ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"],
            "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
            "url": "https://arxiv.org/pdf/1706.03762.pdf",
            "source": "arxiv",
            "year": 2017,
            "venue": "NeurIPS",
            "arxiv_id": "1706.03762",
            "citation_count": 50000
        }
    ]
