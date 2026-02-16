# Paper Search Graph Flow - Deep Analysis

## Executive Summary

This document provides a comprehensive analysis of how the paper search functionality flows through ScholarFlow's LangGraph-based multi-agent system. After examining the entire workflow, I've identified several critical issues and architectural concerns that may be causing paper search to malfunction.

---

## 🎯 Current Architecture Overview

### Graph Structure

ScholarFlow uses a **non-linear multi-agent research graph** with the following key nodes:

```
Entry Point → Router → Search → Ranker → Research Coordinator → Decision Point
                                                                      ↓
                                              Three possible routes:
                                              1. RAG Response (answer generation)
                                              2. Refine Query → Search (retry)
                                              3. Save to Context → Synthesis
```

### Key Components

1. **Router Node** (`router_node`) - Classifies user intent
2. **Search Node** (`search_node`) - Executes paper search
3. **Ranker Node** (`ranker_node`) - Scores papers for relevance
4. **Research Coordinator Node** (`research_coordinator_node`) - Evaluates strategy
5. **RAG Response Node** (`rag_response_node`) - Generates grounded answers

---

## 🔍 Detailed Flow Analysis

### 1. Entry Flow

**File:** `backend/app/agents/graph.py` (Lines 610-625)

```python
graph.set_conditional_entry_point(
    determine_entry_node,
    {
        "supervisor": "supervisor",
        "search": "search",
        "writer": "writer",
        ...
    }
)
```

**Entry Logic** (`backend/app/agents/routing.py`, Lines 335-376):
- Checks query for keywords like "search for", "find papers"
- If intent is "SEARCH", routes directly to search node
- Otherwise goes through Supervisor → Memory → Router

**⚠️ ISSUE #1: Intent Classification Bypass**
- The router uses simple keyword matching (Lines 110-128)
- Keywords: "draft", "write", "outline", "compose" → DRAFT
- Keywords: "analyze" + "image/figure/data/lab" → ANALYZE
- Everything else → SEARCH (default)

This means most queries are classified as SEARCH, which is good, but the classification is very simplistic.

---

### 2. Router to Search Flow

**File:** `backend/app/agents/graph.py` (Lines 635-645)

```python
graph.add_conditional_edges(
    "router",
    route_after_intent,
    {
        "search_subgraph": "search",  # BYPASS CLARIFIER
        "drafting_subgraph": "planner",
        ...
    }
)
```

**⚠️ ISSUE #2: Clarifier Node is BYPASSED**
- The graph was designed with a clarifier node to detect ambiguous queries
- Current routing skips it entirely: `"search_subgraph": "search"`
- The `clarifier_node` exists but is never called for search intents

**Original Design** (Lines 640-651 show commented clarifier routing):
```python
# Clarifier routing (checks if clarification needed)
graph.add_conditional_edges(
    "clarifier",
    route_from_clarifier,
    {
        "search": "search",
        "clarifier_wait": END
    }
)
```

This is DEAD CODE - clarifier is never reached.

---

### 3. Search Node Execution

**File:** `backend/app/agents/nodes.py` (Lines 153-269)

**Search Flow:**
```
1. Get query (check for refined_query or use original)
2. Analyze query with QueryAnalyzer
3. Get optimized_query
4. Call search_all_sources(optimized_query)
5. If <3 papers, try expanded_queries
6. Deduplicate results
7. Auto-save to project library
```

**⚠️ ISSUE #3: Auto-Save May Fail Silently**
Lines 230-247 show auto-save logic:
```python
try:
    db = next(get_db())
    for paper in found_papers:
        exists = db.query(LibraryItem).filter(...)
        if not exists:
            new_item = LibraryItem(...)
            db.add(new_item)
    db.commit()
except Exception as save_err:
    print(f"Error auto-saving papers: {save_err}")  # Non-blocking
```

Issues:
- Uses `print()` instead of proper logging
- Errors are silently swallowed
- No feedback to user if save fails
- `next(get_db())` may cause context issues

**⚠️ ISSUE #4: Search Service Only Uses ArXiv**

**File:** `backend/app/services/paper_search.py` (Lines 103-135)

```python
def search_all_sources(query, max_results_per_source=5):
    # SIMPLIFIED: Use ArXiv only (fast, reliable, no auth needed)
    all_papers = []
    
    try:
        arxiv_papers = search_arxiv_wrapper(query, max_results_per_source * 2)
        all_papers = arxiv_papers
    except Exception as e:
        # Fallback to mock if real search fails
        return _get_mock_papers()
```

**Critical Finding:**
- Only ArXiv is searched (Semantic Scholar commented out)
- If ArXiv fails, it returns MOCK papers
- Mock papers are hardcoded test data
- User may be seeing fake "Retrieval-Augmented Generation" papers

---

### 4. Ranker Node

**File:** `backend/app/agents/nodes.py` (Lines 272-327)

**Ranking Flow:**
```python
for paper in found_papers:
    score = await ai_client.score_paper_relevance(
        paper["title"],
        paper["abstract"],
        query
    )
    paper["relevance_score"] = score
    ranked_papers.append(paper)

ranked_papers.sort(key=lambda p: p["relevance_score"], reverse=True)
```

**⚠️ ISSUE #5: Scoring May Be Slow**
- Calls AI model for EACH paper individually
- Not batched
- If you have 10 papers, that's 10 sequential AI calls
- Could cause 10-20 second delays

---

### 5. Research Coordinator Decision Point

**File:** `backend/app/agents/nodes.py` (Lines 339-393)

The coordinator evaluates results and decides:
- `"proceed"` → Go to RAG Response
- `"refine_query"` → Refine and search again
- `"expand_search"` → Same as proceed
- `"rag_response"` → Go to RAG Response

**File:** `backend/app/agents/specialists.py` (Lines 604-680)

The coordinator uses an LLM call to decide:

```python
prompt = f"""You are a Research Coordinator making strategic decisions...

RESULTS:
- Total papers found: {num_papers}
- Relevant papers (score >{self.quality_threshold}): {num_relevant}
- Average relevance score: {avg_score:.2f}

DECISION: What should we do next?
- "proceed": Results are good
- "refine_query": Query needs adjustment
- "expand_search": Need more papers
- "try_different_approach": Strategy isn't working
"""
```

**⚠️ ISSUE #6: Decision Parsing is Fragile**
Lines 654-658:
```python
parts = response.split('|')
decision = parts[0].strip() if len(parts) > 0 else "proceed"
```

If the LLM doesn't follow the exact format, the decision defaults to "proceed". No validation.

---

### 6. Routing After Coordinator

**File:** `backend/app/agents/graph.py` (Lines 674-691)

```python
def route_from_coordinator(state):
    decision = state.get("coordinator_decision", "proceed")
    iteration = state.get("search_iteration", 0)
    
    if decision == "refine_query" and iteration < max_iterations:
        return "refine_query"
    elif decision in ["proceed", "expand_search", "rag_response"]:
        return "rag_response"
    else:
        return "rag_response"  # Default fallback
```

**⚠️ ISSUE #7: ALL Paths Lead to RAG Response**
Unless it's a refine iteration, everything goes to `rag_response`. There's no path to synthesis or writer from here.

---

### 7. RAG Response Node

**File:** `backend/app/agents/nodes.py` (Lines 724-900)

**Critical Flow - Context Shelf Priority:**
```python
1. Check if user has selected_paper_ids (Context Shelf)
   ↓
2. If YES: Search vector store for relevant chunks from THOSE papers
   ↓
3. If found chunks: Use ONLY library papers (strict priority)
   ↓
4. If NO chunks found in library: Return "No relevant info" message
   ↓
5. If NO selected_paper_ids: Use ranked_papers from ArXiv search
   ↓
6. Generate answer with retrieved context
```

**⚠️ ISSUE #8: Context Shelf Logic May Block Search Results**

Lines 828-849:
```python
if library_papers_info:
    # FORCE LIBRARY USE
    papers_to_use = library_papers_info
    source_type = "library"
elif selected_paper_ids:
    # User selected papers but found nothing
    return {
        "current_draft": {
            "content": """I searched your selected papers but couldn't 
            find specific information..."""
        }
    }
else:
    # Use ArXiv results
    papers_to_use = ranked_papers if ranked_papers else found_papers
```

**The Problem:**
- If you have ANY papers selected in the sidebar (`selected_paper_ids`)...
- But they don't match the query...
- The system returns "No relevant info found"...
- **EVEN IF the search found perfect ArXiv papers!**

This is a logic flaw. The search results are discarded if library papers are selected but don't match.

---

## 🔥 Critical Issues Summary

### Issue #1: Clarifier Bypass
**Location:** `graph.py` Line 638  
**Impact:** Query ambiguity never checked  
**Fix:** Either use clarifier or remove it entirely

### Issue #2: Auto-Save Failures
**Location:** `nodes.py` Lines 230-247  
**Impact:** Papers search but don't appear in library  
**Fix:** Add proper error handling and logging

### Issue #3: ArXiv-Only Search
**Location:** `paper_search.py` Line 114  
**Impact:** Limited paper sources, falls back to mock data  
**Fix:** Re-enable Semantic Scholar or add more sources

### Issue #4: Sequential Scoring Bottleneck
**Location:** `nodes.py` Lines 302-310  
**Impact:** 10+ second delays for ranking  
**Fix:** Batch score all papers in one LLM call

### Issue #5: Context Shelf Blocks Search Results
**Location:** `nodes.py` Lines 828-849  
**Impact:** **This is likely the main bug!**  
If you have papers selected but they don't match the query, search results are thrown away  
**Fix:** Use search results as fallback, don't discard them

### Issue #6: Mock Paper Fallback
**Location:** `paper_search.py` Line 132  
**Impact:** Users may see fake papers if ArXiv fails  
**Fix:** Don't return mock data in production, return empty + error message

### Issue #7: Fragile Decision Parsing
**Location:** `specialists.py` Lines 654-658  
**Impact:** Coordinator decisions may be ignored  
**Fix:** Use structured output (JSON) instead of pipe-delimited text

### Issue #8: No Direct Path to Synthesis
**Location:** `graph.py` Lines 674-691  
**Impact:** Search results always go to RAG, never to synthesis  
**Fix:** Check query intent for "compare", "synthesize" keywords

---

## 📊 Complete Flow Diagram

```
┌──────────────────┐
│   User Query     │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│  determine_entry │ ──── (checks keywords)
└────────┬─────────┘
         │
         v
   ┌─────┴──────┐
   │            │
   v            v
Supervisor   Search (direct)
   │
   v
Memory → Router
            │
            v
      route_after_intent
            │
            v
     ┌──────┴──────┐
     │             │
   Search       Planner
     │
     v
┌──────────────────┐
│   search_node    │ ── Calls search_all_sources(query)
└────────┬─────────┘        │
         │                  v
         │          ArXiv API only  ← ISSUE #3
         │                  │
         │          Auto-save to DB ← ISSUE #2
         │
         v
┌──────────────────┐
│   ranker_node    │ ── Score each paper ← ISSUE #4
└────────┬─────────┘        (Sequential AI calls)
         │
         v
┌──────────────────────────┐
│ research_coordinator     │ ── Evaluate quality
└────────┬─────────────────┘    Decide next action ← ISSUE #6
         │
         v
   route_from_coordinator
         │
     ┌───┴────┐
     │        │
refine_query  rag_response
     │            │
     v            v
   Search    ┌────────────────┐
             │ rag_response   │
             │                │
             │ 1. Check library papers ← ISSUE #8
             │ 2. If selected but no match:
             │    Reject search results!
             │ 3. Generate answer
             └────────┬────────┘
                      │
                      v
               ┌──────────────┐
               │   proactive  │
               └──────┬───────┘
                      │
                      v
                    END
```

---

## 🛠️ Recommended Fixes

### Priority 1: Fix Context Shelf Logic (Main Bug)

**File:** `backend/app/agents/nodes.py` (Line 828)

**Current (BROKEN):**
```python
if library_papers_info:
    papers_to_use = library_papers_info
elif selected_paper_ids:
    # NO MATCH → Reject everything
    return {"content": "No relevant info found"}
else:
    papers_to_use = ranked_papers
```

**Fixed:**
```python
if library_papers_info:
    # Use library first
    papers_to_use = library_papers_info
    source_type = "library"
else:
    # FALLBACK to search results (don't throw them away!)
    papers_to_use = ranked_papers if ranked_papers else found_papers
    source_type = "external"
    
    if not papers_to_use:
        return {"content": "No papers found"}
```

### Priority 2: Add More Search Sources

**File:** `backend/app/services/paper_search.py`

Add Semantic Scholar back, or add:
- OpenAlex API (free, no auth)
- CrossRef (free, no auth)  
- PubMed (for biomedical)

### Priority 3: Batch Paper Scoring

**File:** `backend/app/agents/nodes.py` (Line 302)

**Current:**
```python
for paper in found_papers:
    score = await ai_client.score_paper_relevance(...)
```

**Fixed:**
```python
# Build single prompt with all papers
papers_text = "\n".join([f"{i}. {p['title']}" for i, p in enumerate(papers)])
prompt = f"Score these papers 0-1 for query '{query}':\n{papers_text}"
scores_text = await ai_client.generate_text(prompt)
# Parse scores in batch
```

### Priority 4: Improve Error Handling

Add proper logging throughout:
```python
import logging
logger = logging.getLogger(__name__)

try:
    db.commit()
    logger.info(f"✓ Saved {len(papers)} papers to library")
except Exception as e:
    logger.error(f"✗ Failed to save papers: {e}", exc_info=True)
    # Return error to user
```

### Priority 5: Remove or Fix Clarifier

Either:
1. **Remove** clarifier node completely (if not using it)
2. **Enable** it by routing: `"search_subgraph": "clarifier"` instead of `"search"`

---

## 🧪 Testing Recommendations

### Test Case 1: Basic Search
```
Query: "transformer neural networks"
Expected: Find ArXiv papers, rank them, show results
Check: Do papers appear? Are they relevant?
```

### Test Case 2: Search with Library Papers Selected
```
1. Upload a paper about "computer vision"
2. Select it in sidebar
3. Query: "attention mechanisms in NLP"
Expected: Should show NEW search results (different topic)
Check: Does it reject results because library paper doesn't match?
```

### Test Case 3: Search Failure
```
Disconnect internet or inject ArXiv error
Expected: Error message to user
Check: Does it return mock papers instead?
```

### Test Case 4: Scoring Performance
```
Search query that returns 10 papers
Expected: Ranking completes in <5 seconds
Check: Time the ranker_node execution
```

---

## 📝 Code Quality Issues

### 1. Inconsistent Error Handling
- Some places use `print()`, others use `logger`
- Some exceptions are caught and swallowed
- User never sees errors

### 2. Dead Code
- `clarifier_node` is defined but never called
- `save_to_context` node exists but routing rarely uses it
- Multiple unused conditional branches

### 3. Hard-Coded Values
- `max_results_per_source = 5` in multiple places
- `relevance_threshold = 0.6` (where is settings value?)
- `max_iterations = 3` hardcoded

### 4. State Mutation Issues
- State is passed through nodes and modified
- Not clear what each node adds/changes
- Hard to debug state transformations

---

## 🎓 Architectural Observations

### Good Design Choices

1. **Non-linear Graph**: Agents can route dynamically
2. **Research Coordinator**: Intelligent decision-making
3. **Context Shelf Priority**: User library takes precedence
4. **Message Bus**: Agent communication infrastructure

### Areas for Improvement

1. **Too Many Nodes**: 20+ nodes make the graph hard to follow
2. **Routing Complexity**: 8+ routing functions with overlapping logic
3. **Tight Coupling**: Nodes directly import from services/db
4. **No Retry Logic**: If a node fails, entire workflow stops
5. **State Explosion**: ResearchState has 30+ fields

---

## 🚀 Next Steps

1. **Immediate**: Fix the Context Shelf logic bug (Priority 1)
2. **Short-term**: Add proper logging and error messages
3. **Medium-term**: Optimize paper scoring (batching)
4. **Long-term**: Simplify graph structure, reduce nodes

---

## 📚 References

- Graph Definition: `backend/app/agents/graph.py`
- Node Implementations: `backend/app/agents/nodes.py`
- Routing Logic: `backend/app/agents/routing.py`
- Specialists: `backend/app/agents/specialists.py`
- Search Service: `backend/app/services/paper_search.py`
- State Schema: `backend/app/agents/state.py`

---

**Report Generated:** February 16, 2026  
**Analyst:** GitHub Copilot  
**Status:** Critical bugs identified - immediate action recommended
