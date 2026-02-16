"""RAG-Grounded Response Generation

This module ensures ALL responses are grounded in actual found papers,
with proper citations and no hallucination.

Supports Chain-of-Thought (CoT) reasoning when enabled in config.
"""

from typing import List, Dict, Optional, AsyncIterator
from dataclasses import dataclass
import logging
import re

from app.core.config import settings

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


# ===== UTILITY: Parse Chain-of-Thought outputs =====

def parse_cot_response(response: str) -> Dict[str, str]:
    """Parse response with optional <thinking> tags and ---NARRATION--- / ---CONTENT--- markers
    
    Handles multiple marker variations:
    - ---NARRATION--- / ---CONTENT--- / ---END---
    - NARRATION / CONTENT markers
    - Natural section breaks
    
    Returns dict with keys: thinking, narration, content
    Falls back gracefully if tags are missing.
    """
    result = {
        "thinking": "",
        "narration": "",
        "content": ""
    }
    
    # Extract thinking (if present)
    thinking_match = re.search(r'<thinking>(.*?)</thinking>', response, re.DOTALL | re.IGNORECASE)
    if thinking_match:
        result["thinking"] = thinking_match.group(1).strip()
        # Remove thinking from response for further parsing
        response = re.sub(r'<thinking>.*?</thinking>', '', response, flags=re.DOTALL | re.IGNORECASE)
    
    # Try parsing with strict markers first: ---NARRATION--- / ---CONTENT---
    if "---NARRATION---" in response and "---CONTENT---" in response:
        parts = response.split("---NARRATION---")
        if len(parts) > 1:
            rest = parts[1].split("---CONTENT---")
            if len(rest) > 1:
                result["narration"] = rest[0].strip()
                result["content"] = rest[1].split("---END---")[0].strip()
                return result
    
    # Try parsing with looser markers: "NARRATION" / "CONTENT" (with newlines)
    narration_match = re.search(
        r'(?:###?\s+)?(?:\*\*)?(?:AVATAR\s+)?NARRATION(?:\*\*)?[:\s]+(.*?)(?=(?:###?\s+)?(?:\*\*)?CONTENT|\Z)',
        response,
        re.DOTALL | re.IGNORECASE
    )
    content_match = re.search(
        r'(?:###?\s+)?(?:\*\*)?CONTENT(?:\*\*)?[:\s]+(.*?)(?=##|References:|\Z)',
        response,
        re.DOTALL | re.IGNORECASE
    )
    
    if narration_match:
        result["narration"] = narration_match.group(1).strip()
    
    if content_match:
        result["content"] = content_match.group(1).strip()
    
    # Fallback: if we only got partial parsing, try to intelligently split
    if not result["narration"] and not result["content"]:
        # Last resort: just use entire response
        result["content"] = response.strip()
        result["narration"] = "Here's what I found in the research."
    elif not result["content"] and result["narration"]:
        # If only got narration, rest is content
        result["content"] = response.replace(result["narration"], "").strip()
    elif not result["narration"] and result["content"]:
        # If only got content, use first 2 sentences as narration
        sentences = re.split(r'(?<=[.!?])\s+', result["content"][:200])
        result["narration"] = ". ".join(sentences[:2]) + "."
    
    return result


# RAG-Grounded Prompt Templates (Dual Output: Narration + Written Content)
# These prompts work with or without CoT - the model will add <thinking> if trained to do so
RAG_RESEARCH_PROMPT = """You are my research co-author. I need you to help me understand this research question by analyzing the papers I found.

## My Question:
{query}

## Papers I Found:
{paper_context}

## Previous Context:
{research_context}

## YOUR TASK: Generate TWO separate outputs with CLEAR SEPARATION

Output exactly in this format (CRITICAL):

## NARRATION
[Your conversational explanation here - 2-4 sentences, natural speech like talking to colleague]

Write this like you're explaining to someone over coffee:
- First person: "I found...", "Looking at these papers...", "Here's what's interesting..."
- Conversational tone: Natural, engaging, enthusiastic when appropriate
- Be honest: "I'm not seeing much about X in these papers..."
- Be excited: "Oh, this is fascinating - [1] shows..."
- Keep it flowing: 2-4 sentences max introducing the main insight

## CONTENT
[Your formal written synthesis here - well-structured, cited, professional]

Write this as proper research summary:
- Formal academic language but clear
- Well-organized paragraphs with topic sentences
- All claims cited [1], [2], etc.
- Evidence-based and objective
- Note any disagreements or gaps between papers
- Start with key finding, then supporting details

## Critical Rules:
1. ONLY use information from provided papers - NO fabrication
2. Every claim must have citation [1], [2], [3], etc.
3. If papers disagree, mention it clearly
4. If information is missing, say so and suggest next steps
5. Keep NARRATION and CONTENT completely separate

Now generate your response:
"""


RAG_SUMMARY_PROMPT = """Summarize these papers for me with clear separation between spoken and written formats.

## Question:
{query}

## Papers:
{paper_context}

## Generate these two sections with CLEAR SEPARATION:

## NARRATION
[2-3 sentences introducing what you found - natural, conversational]

Example style: "Alright, I went through these papers and here's the interesting part - they all agree on X, but there's a debate about Y. Let me break down what each one says..."

## CONTENT
[Structured summary with findings, points of agreement/disagreement, gaps - all cited [1], [2], etc.]

Rules:
- Use ONLY information from provided papers
- Every claim must be cited [1], [2], [3]
- Keep narration and content completely separate
- Note where papers agree or disagree
- Identify research gaps
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
        - narration: What the avatar says (conversational)
        - content: Written content (formal)
        - response: Full response (for backwards compatibility)
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
            "thinking": "",
            "narration": "I apologize, but I was unable to generate a response at this time. Please try again.",
            "content": "",
            "response": "I apologize, but I was unable to generate a response at this time. Please try again.",
            "citations": citations,
            "papers_used": [],
            "total_papers_found": len(papers)
        }

    # Parse response (handles both CoT with <thinking> and standard format)
    parsed = parse_cot_response(response)
    thinking = parsed["thinking"]
    narration = parsed["narration"]
    content = parsed["content"]
    
    # Log parsing results for debugging
    logger.info(f"Response parsing: narration_length={len(narration)}, content_length={len(content)}, has_thinking={bool(thinking)}")
    if narration:
        logger.debug(f"Extracted narration: {narration[:150]}...")
    else:
        logger.warning(f"No narration extracted. Response length: {len(response)}. First 200 chars: {response[:200]}")
    
    # Log thinking if present (for debugging/analysis)
    if thinking:
        logger.info(f"Model reasoning: {thinking[:200]}...")  # Log first 200 chars
    
    # Append reference list to content only
    references = format_citations_reference(citations)
    full_content = content + references
    
    # Extract which papers were actually used (by looking for [1], [2] in content)
    papers_used = []
    
    # Include thinking in return value (can be logged or shown to user)
    # Frontend can decide whether to display it based on settings.show_thinking_to_user
    for c in citations:
        if f"[{c.index}]" in content:
            papers_used.append({
                "title": c.title,
                "authors": c.authors,
                "source": c.source,
                "url": c.url
            })
    
    return {
        "thinking": thinking,      # Chain-of-Thought reasoning (may be empty)
        "narration": narration,    # What avatar says
        "content": full_content,   # What's displayed
        "response": full_content,  # Backwards compatibility
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
