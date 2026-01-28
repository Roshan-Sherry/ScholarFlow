"""arXiv API client for paper search using arxiv library"""

import arxiv
from typing import List, Dict, Optional
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class ArxivClient:
    """Client for searching and fetching papers from arXiv"""
    
    def __init__(self):
        self.client = arxiv.Client()
    
    def search(
        self,
        query: str,
        max_results: int = 10,
        sort_by: arxiv.SortCriterion = arxiv.SortCriterion.Relevance
    ) -> List[Dict]:
        """
        Search arXiv for papers matching the query
        
        Args:
            query: Search query (can use arXiv query syntax)
            max_results: Maximum number of results to return
            sort_by: Sort criterion (Relevance, LastUpdatedDate, SubmittedDate)
        
        Returns:
            List of paper dictionaries with metadata
        """
        try:
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=sort_by
            )
            
            results = []
            for paper in self.client.results(search):
                results.append({
                    'arxiv_id': paper.entry_id.split('/')[-1],  # Extract ID from URL
                    'title': paper.title,
                    'authors': [author.name for author in paper.authors],
                    'abstract': paper.summary,
                    'year': paper.published.year if paper.published else None,
                    'published_date': paper.published.isoformat() if paper.published else None,
                    'updated_date': paper.updated.isoformat() if paper.updated else None,
                    'pdf_url': paper.pdf_url,
                    'primary_category': paper.primary_category,
                    'categories': paper.categories,
                    'doi': paper.doi,
                    'journal_ref': paper.journal_ref,
                    'comment': paper.comment
                })
            
            logger.info(f"Found {len(results)} papers for query: {query}")
            return results
            
        except Exception as e:
            logger.error(f"Error searching arXiv: {e}")
            return []
    
    def search_by_id(self, arxiv_id: str) -> Optional[Dict]:
        """
        Get a specific paper by its arXiv ID
        
        Args:
            arxiv_id: arXiv ID (e.g., "1706.03762" or "1706.03762v2")
        
        Returns:
            Paper dictionary or None if not found
        """
        try:
            search = arxiv.Search(id_list=[arxiv_id])
            paper = next(self.client.results(search))
            
            return {
                'arxiv_id': paper.entry_id.split('/')[-1],
                'title': paper.title,
                'authors': [author.name for author in paper.authors],
                'abstract': paper.summary,
                'year': paper.published.year if paper.published else None,
                'published_date': paper.published.isoformat() if paper.published else None,
                'pdf_url': paper.pdf_url,
                'primary_category': paper.primary_category,
                'categories': paper.categories,
                'doi': paper.doi
            }
            
        except StopIteration:
            logger.warning(f"Paper not found: {arxiv_id}")
            return None
        except Exception as e:
            logger.error(f"Error fetching paper {arxiv_id}: {e}")
            return None
    
    def download_pdf(
        self,
        arxiv_id: str,
        download_dir: Path,
        filename: Optional[str] = None
    ) -> Optional[Path]:
        """
        Download PDF for a paper
        
        Args:
            arxiv_id: arXiv ID
            download_dir: Directory to save the PDF
            filename: Optional custom filename (defaults to arxiv_id.pdf)
        
        Returns:
            Path to downloaded PDF or None if failed
        """
        try:
            search = arxiv.Search(id_list=[arxiv_id])
            paper = next(self.client.results(search))
            
            download_dir.mkdir(parents=True, exist_ok=True)
            
            if filename is None:
                filename = f"{arxiv_id.replace('/', '_')}.pdf"
            
            filepath = download_dir / filename
            
            paper.download_pdf(dirpath=str(download_dir), filename=filename)
            
            logger.info(f"Downloaded PDF for {arxiv_id} to {filepath}")
            return filepath
            
        except Exception as e:
            logger.error(f"Error downloading PDF for {arxiv_id}: {e}")
            return None
    
    def search_by_author(self, author_name: str, max_results: int = 10) -> List[Dict]:
        """Search papers by author name"""
        query = f"au:{author_name}"
        return self.search(query, max_results)
    
    def search_by_category(
        self,
        category: str,
        keywords: Optional[str] = None,
        max_results: int = 10
    ) -> List[Dict]:
        """
        Search papers in a specific category
        
        Args:
            category: arXiv category (e.g., "cs.AI", "cs.CL", "cs.LG")
            keywords: Optional keywords to filter by
            max_results: Maximum results
        """
        if keywords:
            query = f"cat:{category} AND all:{keywords}"
        else:
            query = f"cat:{category}"
        
        return self.search(query, max_results, sort_by=arxiv.SortCriterion.LastUpdatedDate)


# Singleton instance
arxiv_client = ArxivClient()
