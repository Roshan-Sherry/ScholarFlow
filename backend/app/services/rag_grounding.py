"""RAG-Grounded Response Generation

This module ensures ALL responses are grounded in actual found papers,
with proper citations and no hallucination.
"""

from typing import List, Dict, Optional, AsyncIterator
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class SourcedCitation:
    """A citation with its source paper"""
    index: int  # [1], [2], etc.
    title: str
    authors: str
    source: str  # ArXiv ID, DOI, etc.
    url: Optional[str] = None
    year: Optional[str] = None
    page: Optional[int] = None  # NEW: Page number for PDF jumps


def format_paper_context(papers: List[Dict], query: str) -> tuple[str, List[SourcedCitation]]:
    """
    Format found papers into context for the LLM with proper citation mapping.
    
    Returns:
        (formatted_context, citations_list)
    """
    if not papers:
        return "No relevant papers found.", []
    
    context_parts = []
    citations = []
    
    for idx, paper in enumerate(papers, 1):
        # Extract paper metadata
        title = paper.get("title", "Unknown Title")
        authors = paper.get("authors", "Unknown Authors")
        if isinstance(authors, list):
            authors = ", ".join(authors[:3])  # First 3 authors
            if len(paper.get("authors", [])) > 3:
                authors += " et al."
        
        abstract = paper.get("abstract", paper.get("summary", ""))
        
        # Check for page-specific text (from PDF chunks)
        text_content = paper.get("text") or abstract
        page_num = paper.get("page_number")
        
        source = paper.get("source", "Unknown")
        arxiv_id = paper.get("arxiv_id", paper.get("paperId", ""))
        url = paper.get("url", paper.get("pdf_url", ""))
        
        # safely extract year
        raw_year = paper.get("year") or paper.get("published")
        year = str(raw_year)[:4] if raw_year else ""
        
        # Create citation record
        citation = SourcedCitation(
            index=idx,
            title=title,
            authors=authors,
            source=f"{source}: {arxiv_id}" if arxiv_id else source,
            url=url,
            year=year,
            page=page_num  # Track page
        )
        citations.append(citation)
        
        # Format context entry with page info
        page_info = f" (Page {page_num})" if page_num else ""
        context_parts.append(f"""
[{idx}] **{title}**{page_info}
Authors: {authors} ({year})
Source: {citation.source}

Content: {text_content[:500]}{'...' if len(text_content) > 500 else ''}
""")
    
    formatted_context = "\n---\n".join(context_parts)
    return formatted_context, citations


def format_citations_reference(citations: List[SourcedCitation]) -> str:
    """Format citations as a reference list"""
    if not citations:
        return ""
    
    lines = ["\n\n## References\n"]
    seen_references = set()
    
    for c in citations:
        # Avoid duplicate reference entries in the list, though in text [1] vs [2] matters
        # If multiple chunks come from same paper, we might list it once
        # But for RAG grounded prompts, we usually map indices 1:1 to context blocks
        
        ref_key = f"{c.index}"
        if ref_key in seen_references:
            continue
        seen_references.add(ref_key)
        
        ref = f"[{c.index}] {c.authors}. \"{c.title}\""
        if c.year:
            ref += f" ({c.year})"
        if c.page:
            ref += f", p.{c.page}"  # Add page to reference
        if c.source:
            ref += f". {c.source}"
        if c.url:
            ref += f". {c.url}"
        lines.append(ref)
    
    return "\n".join(lines)


# RAG-Grounded Prompt Templates
RAG_RESEARCH_PROMPT = """You are ScholarMate, a research co-author (PhD level).
We are working together on a research project. Your goal is to help me synthesize findings from our library into a coherent discussion.

## User Question
{query}

## Our Research Materials (Context Shelf)
{paper_context}

## Previous Conversation Context (Unified Memory)
{research_context}

## Instructions
1. **Adopt a Co-Author Persona**: Speak as a peer. Use "We found...", "Our sources suggest...", "It appears that...", or "We should consider...". Avoid robotic phrases like "The provided text says".
2. **Synthesize, Don't List**: We are writing a paper, not a list of facts. Build an argument based on the evidence.
3. **Cite Everything**: Use [1], [2] to reference specific papers.
4. **Be Critical**: Explicitly highlight contradictions or gaps in *our* current sources. If the papers don't cover the topic, say "Our current sources don't address this, but we might look for..."
5. **Suggest Next Steps**: If appropriate, recommend what we should investigate next.

## Response Format
- **Discussion**: A clear, synthesized answer or argument.
- **Detailed Analysis**: Evidence-based discussion citing specific claims [1].
- **References**: List the papers used at the end.

IMPORTANT: Maintain high academic rigor. No hallucination. Write as if drafting a section of our paper.
"""


RAG_SUMMARY_PROMPT = """Summarize the following research papers for the user. Use ONLY information from these papers.

## User Request
{query}

## Papers to Summarize
{paper_context}

## Instructions
1. Create a cohesive summary connecting the papers' key findings
2. Use [1], [2] citations throughout
3. Highlight areas of agreement and disagreement between papers
4. Note any research gaps identified

## Output
- Executive Summary (2-3 sentences)
- Key Findings from each paper
- Synthesis and Connections
- Research Gaps

IMPORTANT: Cite every claim. Do not add external knowledge.
"""


async def generate_grounded_response(
    query: str,
    papers: List[Dict],
    ai_client,
    prompt_type: str = "research",
    research_context: Optional[str] = None  # NEW: Unified memory context
) -> Dict:
    """
    Generate a response grounded in the provided papers.
    
    Returns dict with:
        - response: The generated text
        - citations: List of SourcedCitation objects
        - papers_used: List of paper IDs that should be saved
    """
    # Format papers into context
    paper_context, citations = format_paper_context(papers, query)
    
    # Select prompt template
    if prompt_type == "summary":
        prompt = RAG_SUMMARY_PROMPT.format(query=query, paper_context=paper_context)
    else:
        prompt = RAG_RESEARCH_PROMPT.format(
            query=query, 
            paper_context=paper_context,
            research_context=research_context or "No relevant past context found."
        )
    
    # Generate response
    response = await ai_client.generate_text(prompt, temperature=0.3)  # Low temp for accuracy
    
    if not response:
        logger.warning(f"AI Client returned empty response for query: {query}")
        return {
            "response": "I apologize, but I was unable to generate a response at this time. Please try again.",
            "citations": citations,
            "papers_used": [],
            "total_papers_found": len(papers)
        }

    
    # Append reference list
    references = format_citations_reference(citations)
    full_response = response + references
    
    # Extract which papers were actually used (by looking for [1], [2] in response)
    papers_used = []
    for c in citations:
        if f"[{c.index}]" in response:
            papers_used.append({
                "title": c.title,
                "authors": c.authors,
                "source": c.source,
                "url": c.url
            })
    
    return {
        "response": full_response,
        "citations": citations,
        "papers_used": papers_used,
        "total_papers_found": len(papers)
    }


async def stream_grounded_response(
    query: str,
    papers: List[Dict],
    ai_client,
    prompt_type: str = "research",
    research_context: Optional[str] = None
) -> AsyncIterator[Dict]:
    """
    Stream a response grounded in the provided papers token-by-token.
    
    Yields dicts with:
        - type: "chunk" | "metadata"
        - content: text chunk (for type="chunk")
        - citations: list (for type="metadata")
        - papers_used: list (for type="metadata")
    """
    # Format papers into context
    paper_context, citations = format_paper_context(papers, query)
    
    # Select prompt template
    if prompt_type == "summary":
        prompt = RAG_SUMMARY_PROMPT.format(query=query, paper_context=paper_context)
    else:
        prompt = RAG_RESEARCH_PROMPT.format(
            query=query, 
            paper_context=paper_context,
            research_context=research_context or "No relevant past context found."
        )
    
    # Stream response chunks
    full_response = ""
    try:
        async for chunk in ai_client.generate_text_stream(prompt, temperature=0.3):
            full_response += chunk
            yield {
                "type": "chunk",
                "content": chunk
            }
    except Exception as e:
        logger.error(f"Streaming failed: {e}")
        yield {
            "type": "chunk",
            "content": "I apologize, but I encountered an error while generating the response."
        }
        return
    
    # Append reference list at the end
    references = format_citations_reference(citations)
    if references:
        yield {
            "type": "chunk",
            "content": references
        }
    
    # Extract which papers were actually used
    papers_used = []
    for c in citations:
        if f"[{c.index}]" in full_response:
            papers_used.append({
                "title": c.title,
                "authors": c.authors,
                "source": c.source,
                "url": c.url
            })
    
    # Send metadata at the end
    yield {
        "type": "metadata",
        "citations": citations,
        "papers_used": papers_used,
        "total_papers_found": len(papers)
    }
