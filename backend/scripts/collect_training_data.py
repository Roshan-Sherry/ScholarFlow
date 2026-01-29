#!/usr/bin/env python3
"""
Collect academic training data for fine-tuning ScholarMate model
Sources: ArXiv, PubMed, OpenReview
"""
import arxiv
import json
from pathlib import Path
from typing import List, Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path("data/training")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def fetch_arxiv_papers(categories: List[str], max_results: int = 1000) -> List[Dict]:
    """Fetch papers from ArXiv for training data"""
    papers = []
    
    for category in categories:
        logger.info(f"Fetching {category} papers...")
        search = arxiv.Search(
            query=f"cat:{category}",
            max_results=max_results // len(categories),
            sort_by=arxiv.SortCriterion.SubmittedDate
        )
        
        for result in search.results():
            papers.append({
                "title": result.title,
                "abstract": result.summary,
                "authors": [author.name for author in result.authors],
                "categories": result.categories,
                "arxiv_id": result.entry_id.split('/')[-1],
                "pdf_url": result.pdf_url
            })
    
    logger.info(f"Collected {len(papers)} papers")
    return papers

def create_instruction_pairs(papers: List[Dict]) -> List[Dict]:
    """Convert papers into instruction-following format for fine-tuning"""
    training_data = []
    
    for paper in papers:
        # Task 1: Summarization
        training_data.append({
            "instruction": f"Summarize the following research paper in 3-4 sentences:\n\nTitle: {paper['title']}\n\nAbstract: {paper['abstract']}",
            "output": f"This paper presents {paper['title'].lower()}. {paper['abstract'][:200]}..."
        })
        
        # Task 2: Research Question Extraction
        training_data.append({
            "instruction": f"What research question does this paper address?\n\n{paper['abstract']}",
            "output": f"Based on the abstract, this paper investigates [extracted from {paper['title']}]"
        })
        
        # Task 3: Methodology Analysis
        training_data.append({
            "instruction": f"Identify the key methodology used in this research:\n\n{paper['abstract']}",
            "output": "The researchers employ [method extracted from abstract]"
        })
    
    return training_data

def save_training_data(data: List[Dict], filename: str):
    """Save in JSONL format for Ollama fine-tuning"""
    output_path = OUTPUT_DIR / filename
    
    with output_path.open('w', encoding='utf-8') as f:
        for item in data:
            f.write(json.dumps(item) + '\n')
    
    logger.info(f"Saved {len(data)} training examples to {output_path}")

if __name__ == "__main__":
    # Focus on CS/ML/AI categories
    categories = [
        "cs.AI",  # Artificial Intelligence
        "cs.CL",  # Computation and Language
        "cs.LG",  # Machine Learning
        "cs.CV",  # Computer Vision
    ]
    
    logger.info("Starting training data collection...")
    papers = fetch_arxiv_papers(categories, max_results=1000)
    
    logger.info("Creating instruction pairs...")
    training_data = create_instruction_pairs(papers)
    
    logger.info("Saving training data...")
    save_training_data(training_data, "scholarmate_training.jsonl")
    
    logger.info("✅ Training data collection complete!")
    logger.info(f"Total examples: {len(training_data)}")
