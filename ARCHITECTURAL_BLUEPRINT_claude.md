# 🏗️ ScholarFlow Architectural Blueprint
**Agentic Mesh Architecture - Technical Specification**

---

## 🎯 System Overview

ScholarFlow is a **local-first agentic research OS** implementing a **non-linear multi-agent mesh** orchestrated by LangGraph. It uses a "Two-Brain" philosophy: deterministic models for discovery (Research Mode) and creative models for synthesis (Studio Mode).

**Core Stack:**
- **Orchestration:** LangGraph (StateGraph)
- **Intelligence:** Ollama (Local LLMs)
- **Backend:** Python 3.11+ (FastAPI)
- **Frontend:** React + TypeScript (Vite)
- **State Management:** Zustand
- **Vector Store:** FAISS + ChromaDB

---

## 📊 The Graph Topology

### Visual Representation (Text-Based)

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           │
              ┌────────────▼──────────┐
              │  determine_entry_node │
              └────┬─────┬─────┬──────┘
                   │     │     └─────────────┐
    ┌──────────────┘     │                   │
    │                    │                   │
    ▼                    ▼                   ▼
┌───────────┐      ┌──────────┐       ┌──────────┐
│ SUPERVISOR│      │  SEARCH  │       │  WRITER  │
└─────┬─────┘      └────┬─────┘       └─────┬────┘
      │                 │                    │
      ▼                 │                    │
┌──────────┐            │                    │
│  MEMORY  │            │                    │
└─────┬────┘            │                    │
      │                 │                    │
      ▼                 │                    │
┌──────────┐            │                    │
│  ROUTER  │            │                    │
└─────┬────┘            │                    │
      │                 │                    │
 ┌────┴────┬───────┬────┴──────┬─────────────┘
 │         │       │           │
 ▼         ▼       ▼           ▼
┌──────┐ ┌────────┐ ┌──────────┐
│DRAFT │ │LAB_ANAL│ │CLARIFIER │
│      │ │        │ └─────┬────┘
└──┬───┘ └───┬────┘       │
   │         │         ┌──┴──┐
   │         │         │     │
   ▼         ▼         ▼     ▼
┌────────┐            [SEARCH or END]
│PLANNER │            
└───┬────┘            
    │                 
    ▼                 
[WRITER]             

═══════════════════════════════════════════════
          DISCOVERY LOOP (Search → Rank)
═══════════════════════════════════════════════

    SEARCH
      │
      ▼
    RANKER ──────┐
      │          │
      ▼          │ (ranking complete)
RESEARCH_        │
COORDINATOR      │
      │          │
  ┌───┴───┐      │
  │       │      │
  ▼       ▼      │
REFINE  SAVE_TO  │
QUERY   CONTEXT  │
  │       │      │
  │       ▼      │
  │   SYNTHESIS◄─┘
  │       │
  │       ▼
  └──►[CITATION, WRITER, SEARCH, PROACTIVE]

═══════════════════════════════════════════════
          STUDIO LOOP (Write → Review)
═══════════════════════════════════════════════

    WRITER
      │
  ┌───┴────┬─────────────┬─────────┐
  │        │             │         │
  ▼        ▼             ▼         ▼
CITATION SEARCH     SYNTHESIS  REVIEWER
  │        │             │         │
  │        │             │     ┌───┴───┐
  │        │             │     │       │
  ▼        │             │     ▼       ▼
VALIDATOR  │             │   WRITER  PROACTIVE
  │        │             │     │       │
  ▼        │             │     │       ▼
WRITER◄────┴─────────────┴─────┘      END
  │
  ▼
REVIEWER ───► (if approved) ───► PROACTIVE ───► END
  │
  └──► (if needs revision) ──► WRITER (loop)

```

### Key Routing Decisions

| **Node**             | **Conditional Edge**              | **Routes To**                                  | **Condition**                                    |
|----------------------|-----------------------------------|------------------------------------------------|--------------------------------------------------|
| `clarifier`          | `route_from_clarifier`            | `search` OR `END`                              | If `needs_clarification=True` → END (wait user)  |
| `research_coordinator` | `route_from_coordinator`         | `refine_query`, `save_to_context`, `synthesis` | Based on `coordinator_decision`                  |
| `search`             | `route_from_search`               | `ranker`, `synthesis`, `writer`                | Based on caller & paper count                    |
| `ranker`             | `route_from_ranker`               | `refine_query`, `rag_response`, `synthesis`    | Based on relevance scores & iteration count      |
| `writer`             | `route_from_writer`               | `citation`, `search`, `reviewer`, `writer`     | Based on draft status & markers in content       |
| `reviewer`           | `route_from_reviewer`             | `writer`, `planner`, `citation`, `proactive`   | Based on `needs_revision` flag                   |
| `proactive`          | `route_from_proactive`            | `search`, `synthesis`, `writer`, `END`         | Based on suggested actions                       |

---

## 📦 State Dictionary

### Core State: `ResearchState` (TypedDict)

| **Field**                    | **Type**                   | **Purpose**                                                                                  | **Default** |
|------------------------------|----------------------------|----------------------------------------------------------------------------------------------|-------------|
| `messages`                   | `List[BaseMessage]`        | LangChain message history (appended with `operator.add`)                                     | `[]`        |
| `query`                      | `str`                      | User's input query                                                                           | Required    |
| `project_id`                 | `str`                      | Database project identifier                                                                  | Required    |
| `session_id`                 | `Optional[str]`            | Chat session identifier                                                                      | `None`      |
| **Discovery State**          |                            |                                                                                              |             |
| `found_papers`               | `List[Dict]`               | Papers from external APIs (ArXiv, SemanticScholar)                                           | `[]`        |
| `ranked_papers`              | `List[Dict]`               | Papers after relevance scoring                                                               | `[]`        |
| `selected_paper_ids`         | `List[str]`                | User-selected paper IDs for context                                                          | `[]`        |
| `search_iteration`           | `int`                      | Current discovery loop iteration (max=3)                                                     | `0`         |
| `refined_query`              | `Optional[str]`            | Modified query for retry                                                                     | `None`      |
| **Coordinator State**        |                            |                                                                                              |             |
| `coordinator_decision`       | `Optional[str]`            | "proceed", "refine_query", "expand_search", "try_different_approach"                         | `None`      |
| `coordinator_reasoning`      | `Optional[str]`            | Explanation of coordinator's decision                                                        | `None`      |
| `coordinator_suggestions`    | `Optional[str]`            | Specific actions to take                                                                     | `None`      |
| **Drafting State**           |                            |                                                                                              |             |
| `current_draft`              | `Dict`                     | `{section: str, content: str, status: str}`                                                  | `{}`        |
| `current_section`            | `Optional[str]`            | Which section is being drafted (introduction, methods, results)                              | `None`      |
| `critique_feedback`          | `Optional[str]`            | Reviewer's feedback                                                                          | `None`      |
| `revision_count`             | `int`                      | Current revision loop iteration (max=2)                                                      | `0`         |
| `needs_revision`             | `bool`                     | Flag for conditional edge to writer                                                          | `False`     |
| **Intent Routing**           |                            |                                                                                              |             |
| `intent`                     | `Optional[str]`            | "SEARCH", "CHAT", "DRAFT", "ANALYZE"                                                         | `None`      |
| `operation_mode`             | `Optional[str]`            | "research" (learning) or "studio" (writing)                                                  | `"research"`|
| **Clarification**            |                            |                                                                                              |             |
| `query_ambiguity_score`      | `Optional[float]`          | 0.0-1.0, >0.7 triggers clarification                                                         | `None`      |
| `clarification_question`     | `Optional[str]`            | Question to ask user                                                                         | `None`      |
| `clarification_answer`       | `Optional[str]`            | User's answer                                                                                | `None`      |
| `needs_clarification`        | `bool`                     | Flag for clarifier node                                                                      | `False`     |
| **Streaming Logs**           |                            |                                                                                              |             |
| `logs`                       | `List[Dict]`               | Workflow logs for SSE streaming (appended with `operator.add`)                               | `[]`        |
| **Multi-Agent System**       |                            |                                                                                              |             |
| `active_agent`               | `Optional[str]`            | Current agent handling request                                                               | `None`      |
| `agent_history`              | `List[Dict]`               | Agent handoff log (appended with `operator.add`)                                             | `[]`        |
| `supervisor_decision`        | `Optional[Dict]`           | Supervisor's routing and reasoning                                                           | `None`      |
| `conversation_memory`        | `List[Dict]`               | Structured conversation history                                                              | `[]`        |
| `research_insights`          | `Dict`                     | `{key_findings: [], methodologies: [], gaps_identified: []}`                                 | `{...}`     |
| `citations_used`             | `Dict`                     | `paper_id -> citation_number` mapping                                                        | `{}`        |
| `bibliography`               | `List[Dict]`               | Formatted references                                                                         | `[]`        |
| `citation_suggestions`       | `List[Dict]`               | Proactive citation recommendations                                                           | `[]`        |
| `next_actions`               | `List[Dict]`               | Suggested next steps                                                                         | `[]`        |
| `synthesis_summary`          | `Optional[str]`            | Multi-paper synthesis                                                                        | `None`      |
| `comparative_analysis`       | `Optional[Dict]`           | Paper comparisons                                                                            | `None`      |
| **Non-Linear Workflow**      |                            |                                                                                              |             |
| `agent_messages`             | `List[Dict]`               | Inter-agent messages (message bus)                                                           | `[]`        |
| `workflow_state`             | `Optional[str]`            | "running", "paused", "complete", "stuck"                                                     | `"running"` |
| `routing_history`            | `List[Dict]`               | Routing decisions log (appended with `operator.add`)                                         | `[]`        |
| `reroute_requested`          | `bool`                     | Flag to trigger re-routing                                                                   | `False`     |
| `reroute_reason`             | `Optional[str]`            | Why re-routing is needed                                                                     | `None`      |
| `suggested_next_agent`       | `Optional[str]`            | Suggested agent for re-route                                                                 | `None`      |
| **Error Handling**           |                            |                                                                                              |             |
| `error`                      | `Optional[str]`            | Error message                                                                                | `None`      |

---

## 🤖 Agent Roster

### Core Orchestration Agents

| **Agent**             | **Node Function**            | **Input**                           | **Output**                                      | **Model Used**         |
|-----------------------|------------------------------|-------------------------------------|-------------------------------------------------|------------------------|
| **Supervisor**        | `supervisor_node`            | `ResearchState` (full)              | `supervisor_decision`, `active_agent`           | `scholarmate` (3B)     |
| **Memory**            | `memory_node`                | `query`, `conversation_memory`      | `conversation_memory`, `research_insights`      | N/A (state mgmt)       |
| **Router**            | `router_node`                | `query`                             | `intent` ("SEARCH", "DRAFT", "ANALYZE", "CHAT") | `llama3.2:1b` (Flash)  |
| **Clarifier**         | `clarifier_node`             | `query`, `clarification_answer`     | `query_ambiguity_score`, `needs_clarification`  | `llama3.2:1b` (Flash)  |
| **Monitor**           | `workflow_monitor_node`      | Full state                          | `reroute_requested`, performance metrics        | N/A (state analysis)   |

### Discovery Agents (Research Mode)

| **Agent**               | **Node Function**              | **Input**                           | **Output**                                      | **Model Used**             |
|-------------------------|--------------------------------|-------------------------------------|-------------------------------------------------|----------------------------|
| **Search**              | `search_node`                  | `query`, `refined_query`            | `found_papers`, `search_iteration`              | N/A (API calls)            |
| **Ranker**              | `ranker_node`                  | `found_papers`, `query`             | `ranked_papers` (with relevance scores)         | `scholarflow-search` (1B)  |
| **Research Coordinator**| `research_coordinator_node`    | `ranked_papers`, `query`            | `coordinator_decision`, `coordinator_reasoning` | `scholarmate` (3B)         |
| **Query Refiner**       | `refine_query_node`            | `query`, `coordinator_suggestions`  | `refined_query`                                 | `scholarmate` (3B)         |
| **Lab Analyst**         | `lab_analyst_node`             | `lab_asset_ids` (images)            | `lab_asset_descriptions`                        | Gemini Vision (1.5 Flash)  |
| **Synthesis**           | `synthesis_node`               | `ranked_papers`, `query`            | `synthesis_summary`, `comparative_analysis`     | `scholarmate` (3B)         |

### Creation Agents (Studio Mode)

| **Agent**             | **Node Function**            | **Input**                           | **Output**                                      | **Model Used**             |
|-----------------------|------------------------------|-------------------------------------|-------------------------------------------------|----------------------------|
| **Planner**           | `planner_node`               | `query`, `selected_paper_ids`       | `current_draft` (outline)                       | `scholarmate` (3B)         |
| **Writer**            | `writer_node`                | `query`, `context`, `section`       | `current_draft` (content)                       | `scholarflow-studio` (3B)  |
| **Reviewer**          | `reviewer_node`              | `current_draft`                     | `critique_feedback`, `needs_revision`           | `scholarmate` (3B)         |
| **RAG Response**      | `rag_response_node`          | `query`, `ranked_papers`, context   | `current_draft` (grounded answer)               | `scholarmate` (3B)         |

### Specialist Agents

| **Agent**             | **Node Function**            | **Input**                           | **Output**                                      | **Model Used**             |
|-----------------------|------------------------------|-------------------------------------|-------------------------------------------------|----------------------------|
| **Citation**          | `citation_node`              | `ranked_papers`, `current_draft`    | `citations_used`, `bibliography`                | `scholarmate` (3B)         |
| **Proactive**         | `proactive_node`             | Full state                          | `next_actions`, `quality_feedback`              | `scholarmate` (3B)         |

---

## 🧠 The "Two-Brain" Philosophy

### Research Mode (Deterministic)
**Purpose:** Discovery, ranking, relevance scoring  
**Model:** `scholarflow-search` (llama3.2:1b)  
**Temperature:** 0.2 (strict)  
**Use Cases:**
- Paper relevance scoring (`score_paper_relevance`)
- Intent classification (fast routing)
- Query ambiguity detection

**System Prompt (excerpt):**
```
You are a research paper relevance analyzer.
SCORING GUIDE:
0.9-1.0: Perfect match, highly relevant
0.7-0.8: Strong relevance, directly applicable
Be strict with relevance (avoid false positives).
```

### Studio Mode (Creative)
**Purpose:** Original academic writing, plagiarism-free synthesis  
**Model:** `scholarflow-studio` (llama3.2:3b)  
**Temperature:** 0.75 (creative but controlled)  
**Use Cases:**
- Draft generation (`writer_node` with `mode="studio"`)
- Section-specific writing (intro, methods, results, discussion)

**System Prompt (excerpt):**
```
You are Dr. Scholar, a distinguished academic writer.
ANTI-PLAGIARISM TECHNIQUES:
- Paraphrase at concept level, not word level
- Restructure information flow completely
- Add contextual bridges between ideas
- Express ideas through YOUR analytical lens
```

### Model Selection Logic
**File:** `backend/app/core/ai_client.py`

```python
async def generate_text(self, prompt: str, mode: str = "general"):
    if use_flash:
        model = self.flash_model  # llama3.2:1b
    elif mode == "search":
        model = self.search_model  # scholarflow-search (1B)
    elif mode == "studio":
        model = self.studio_model  # scholarflow-studio (3B)
    else:
        model = self.text_model  # Default: scholarmate (3B)
```

---

## ⚙️ Setup Guide

### 1. Install Ollama
```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download/windows
```

### 2. Pull Base Model
```bash
ollama pull llama3.2:1b
ollama pull llama3.2:3b
```

### 3. Create Custom Models
```bash
# Navigate to backend/models/
cd backend/models/

# Create Search Model (1B, Deterministic)
ollama create scholarflow-search -f ScholarFlow-Search.Modelfile

# Create Studio Model (3B, Creative)
ollama create scholarflow-studio -f ScholarFlow-Studio.Modelfile

# Create General Model (3B, Balanced)
ollama create scholarmate -f ScholarMate.Modelfile
```

### 4. Verify Models
```bash
ollama list
# Should show:
# - llama3.2:1b
# - llama3.2:3b
# - scholarflow-search
# - scholarflow-studio
# - scholarmate
```

### 5. Keep Models Loaded (Optional)
```bash
# Pre-load models into memory for faster inference
ollama run scholarflow-search
ollama run scholarflow-studio
ollama run scholarmate
```

### 6. Configure Backend
**File:** `backend/.env`

```env
# LLM Provider (hybrid = Ollama for text + Gemini for vision)
LLM_PROVIDER=hybrid

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_FAST=llama3.2:1b
OLLAMA_MODEL_SMART=scholarmate
OLLAMA_MODEL_SEARCH=scholarflow-search
OLLAMA_MODEL_STUDIO=scholarflow-studio

# Gemini (for vision tasks)
GOOGLE_API_KEY=your_gemini_api_key_here

# LangGraph Limits
MAX_SEARCH_ITERATIONS=3
MAX_REVISION_ITERATIONS=2
RELEVANCE_THRESHOLD=0.6
```

### 7. Start Services
```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd ..
npm install
npm run dev
```

---

## 🔍 Verification Checklist

After setup, verify the architecture:

### ✅ Graph Integrity
```python
# backend/app/agents/graph.py
from app.agents.graph import research_graph

# Check compiled graph
print(research_graph.get_graph().draw_mermaid())
```

### ✅ Loop Safety
```python
# Check max iterations are set
from app.core.config import settings
assert settings.max_search_iterations == 3
assert settings.max_revision_iterations == 2
```

### ✅ Model Loading
```bash
# Test each model
ollama run scholarflow-search "Rate this paper relevance: Machine Learning"
ollama run scholarflow-studio "Write an introduction about transformers"
```

### ✅ State Schema
```python
# backend/tests/test_state.py
from app.agents.state import create_initial_state

state = create_initial_state(
    query="What is Chain-of-Thought?",
    project_id="test123"
)

# Verify all keys exist
assert "search_iteration" in state
assert "revision_count" in state
assert "operation_mode" in state
```

---

## 📈 Performance Notes

### Expected Latencies (Ollama on M1 Mac)
- **llama3.2:1b (flash):** 0.2-0.5s per generation
- **llama3.2:3b (smart/studio):** 1-3s per generation
- **Gemini Vision:** 2-5s per image analysis

### Optimization Strategies
1. **Fast Path Routing:** Direct queries skip supervisor (see `determine_entry_node`)
2. **Model Caching:** `keep_alive=-1` keeps models in memory
3. **Parallel Synthesis:** Multiple papers processed concurrently
4. **Vector Store Caching:** FAISS index persisted to disk

---

## 🐛 Known Issues & Workarounds

### Issue 1: Custom Models Not Found
**Error:** `Model 'scholarflow-studio' not found`

**Fix:**
```bash
ollama create scholarflow-studio -f backend/models/ScholarFlow-Studio.Modelfile
```

### Issue 2: Ollama Connection Refused
**Error:** `ConnectionRefusedError: [Errno 61] Connection refused`

**Fix:**
```bash
# Start Ollama server
ollama serve
```

### Issue 3: Infinite Loop (theoretical)
**Status:** Protected by `max_search_iterations=3` and `max_revision_iterations=2`

**Verify:**
```python
# Check state increments properly
state["search_iteration"] += 1  # In refine_query_node
state["revision_count"] += 1    # In reviewer_node
```

---

## 🎓 Advanced Topics

### Custom Agent Addition
To add a new agent:

1. **Define Node Function** in `backend/app/agents/nodes.py`
2. **Add to Graph** in `backend/app/agents/graph.py`
3. **Define Routing Logic** in `backend/app/agents/routing.py`
4. **Update State** in `backend/app/agents/state.py` (if new fields needed)

### Example: Adding a "Fact Checker" Agent
```python
# nodes.py
async def fact_checker_node(state: ResearchState) -> Dict:
    draft_content = state["current_draft"]["content"]
    # Verify claims against papers
    return {"fact_check_results": [...]}

# graph.py
graph.add_node("fact_checker", fact_checker_node)
graph.add_edge("writer", "fact_checker")
graph.add_edge("fact_checker", "reviewer")
```

---

## 📚 References

- **LangGraph Docs:** https://python.langchain.com/docs/langgraph
- **Ollama Modelfile Spec:** https://github.com/ollama/ollama/blob/main/docs/modelfile.md
- **FAISS Vector Store:** https://github.com/facebookresearch/faiss
- **LangChain AI:** https://python.langchain.com

---

**Last Updated:** February 9, 2026  
**Generated By:** Claude Sonnet 4.5 (ScholarFlow Deep Audit)  
**Blueprint Version:** 1.0.0
