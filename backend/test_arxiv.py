"""Quick test script to verify ArXiv API is working"""

import sys
sys.path.insert(0, 'c:\\Users\\fudha\\Desktop\\scholarflow\\backend')

from app.services.arxiv_client import arxiv_client

# Test search
print("Testing ArXiv search...")
print("=" * 60)

query = "attention mechanisms"
print(f"Query: {query}")
print("=" * 60)

results = arxiv_client.search(query, max_results=5)

print(f"\nFound {len(results)} papers:")
print("=" * 60)

for i, paper in enumerate(results, 1):
    print(f"\n{i}. {paper['title']}")
    print(f"   Authors: {', '.join(paper['authors'][:3])}")
    print(f"   Year: {paper['year']}")
    print(f"   ArXiv ID: {paper['arxiv_id']}")
    print(f"   PDF: {paper['pdf_url']}")

print("\n" + "=" * 60)
print("Test complete!")
