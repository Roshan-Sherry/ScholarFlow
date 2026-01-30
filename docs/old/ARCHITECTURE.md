# ScholarFlow System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React 19)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Dashboard   │  │  Discovery   │  │  Studio (Editor)     │  │
│  │  (Projects)  │  │  (Search AI) │  │  (Writer + Monitor)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                   │
│  State: Zustand  |  Data: React Query  |  Streaming: SSE        │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP/SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LangGraph Cyclic Workflow                   │   │
│  │                                                           │   │
│  │  Router ──→ Search ──→ Ranker ──→ Refine Query ↺ (Loop)│   │
│  │      ↓                    ↓                               │   │
│  │  Lab Analyst          Save Context                        │   │
│  │      ↓                    ↓                               │   │
│  │  Planner ──→ Writer ──→ Reviewer ──→ Revise ↺ (Loop)    │   │
│  │                          ↓                                │   │
│  │                         END                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Vector Store │  │  AI Client   │  │  Lab Analyst         │  │
│  │  (FAISS)     │  │ (Multi-LLM)  │  │  (Vision API)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                   │
│  Database: SQLite/PostgreSQL  |  File Storage: Local FS          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Breakdown

### Frontend Architecture

```
App.tsx (Root Orchestrator)
├── Global State (Zustand)
│   ├── useAppStore (viewState, appMode, projects)
│   ├── useProjectStore (activeProject, files)
│   └── useAgentStore (logs, agentState, streaming)
│
├── Layout Components
│   ├── SidebarLeft (Context Selector / Agent Monitor)
│   ├── MainWorkspace (Dynamic based on mode)
│   │   ├── Dashboard (Project Grid)
│   │   ├── WorkspaceDiscovery (Chat + Search Results)
│   │   ├── WorkspaceReading (PDF Viewer)
│   │   └── WorkspaceStudio (Editor + Live Preview)
│   └── SidebarRight (Co-Author / PDF Chat / Agent Logs)
│
└── Data Layer (React Query)
    ├── useProjects (CRUD operations)
    ├── useLabAssets (Upload + Fetch)
    └── useStreaming (SSE Event Handling)
```

#### State Flow Example: Uploading a Lab Asset

```
1. User clicks "Upload Asset" button
   ↓
2. File picker opens → User selects image
   ↓
3. useUploadLabAsset().mutate({ projectId, file, name, type })
   ↓
4. POST /lab/projects/{id}/upload (FormData with image)
   ↓
5. Backend: lab_analyst.ingest_lab_asset()
   ├── Save file to disk
   ├── Call ai_client.analyze_image() [Gemini Vision]
   └── Store asset + AI description in database
   ↓
6. Frontend: React Query invalidates cache
   ↓
7. UI re-fetches assets and displays new item with description
```

---

### Backend Architecture

```
FastAPI App (main.py)
├── API Routers
│   ├── /projects/* (Project CRUD)
│   ├── /papers/* (PDF upload, fetch)
│   ├── /lab/* (Lab asset management)
│   └── /chat/* (SSE streaming workflows)
│
├── Services Layer
│   ├── VectorStoreService (FAISS similarity search)
│   ├── LabAnalystService (Image analysis)
│   └── AIClient (Multi-provider LLM)
│
├── Agent Layer (LangGraph)
│   ├── graph.py (Workflow definition)
│   ├── nodes.py (Agent logic: router, search, writer, etc.)
│   ├── state.py (ResearchState schema)
│   └── prompts.py (LLM prompts)
│
└── Data Layer
    ├── SQLAlchemy Models (Projects, Papers, LabAssets, LibraryItems)
    └── Alembic Migrations
```

---

## LangGraph Workflow Deep Dive

### Complete Node Graph

```
                    ┌──────────────┐
                    │   START      │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   ROUTER     │ ← Classifies intent
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   SEARCH     │  │  LAB ANALYST │  │   PLANNER    │
│  (Discovery) │  │  (Analyze)   │  │  (Outline)   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 │                 │
┌──────────────┐         │                 │
│   RANKER     │         │                 │
│  (Score)     │         │                 │
└──────┬───────┘         │                 │
       │                 │                 │
       ▼◄────────────────┘                 │
┌──────────────┐                           │
│  DECISION:   │                           │
│  Refine?     │◄──────────────────────────┘
└──────┬───────┘                           │
       │                                   │
  ┌────┴────┐                              │
  │         │                              │
  ▼         ▼                              │
┌───────┐ ┌───────────────┐               │
│REFINE │ │ SAVE CONTEXT  │               │
│QUERY  │ └───────┬───────┘               │
│(Loop) │         │                       │
└───┬───┘         │                       │
    │             │                       │
    └─────────────┼───────────────────────┘
                  │
                  ▼
           ┌──────────────┐
           │   WRITER     │ ← Generates draft
           └──────┬───────┘
                  │
                  ▼
           ┌──────────────┐
           │   REVIEWER   │ ← Critiques draft
           └──────┬───────┘
                  │
                  ▼
           ┌──────────────┐
           │  DECISION:   │
           │  Revise?     │
           └──────┬───────┘
                  │
             ┌────┴────┐
             │         │
             ▼         ▼
      ┌───────────┐ ┌──────────────┐
      │  WRITER   │ │  APPROVED    │
      │  (Loop)   │ │              │
      └─────┬─────┘ └──────┬───────┘
            │              │
            └──────────────┼────────┐
                           │        │
                           ▼        ▼
                        ┌──────────────┐
                        │     END      │
                        └──────────────┘
```

### Node Descriptions

| Node | Purpose | Inputs | Outputs |
|------|---------|--------|---------|
| **Router** | Classifies user intent (SEARCH/DRAFT/ANALYZE) | `query` | `intent` |
| **Search** | Fetches papers from arXiv/Semantic Scholar | `query`, `iteration` | `raw_papers` |
| **Ranker** | Scores papers by relevance | `raw_papers`, `query` | `ranked_papers`, `top_score` |
| **Refine Query** | Reformulates query if results are poor | `query`, `ranked_papers` | `refined_query` |
| **Lab Analyst** | Analyzes uploaded images/data | `lab_asset_ids` | `asset_descriptions` |
| **Planner** | Generates manuscript outline | `selected_paper_ids`, `query` | `outline` |
| **Writer** | Drafts text sections | `query`, `context_chunks`, `assets` | `current_draft` |
| **Reviewer** | Critiques draft for quality | `current_draft` | `needs_revision`, `feedback` |

### Conditional Edges

#### `should_refine_search()`
```python
def should_refine_search(state: ResearchState) -> str:
    if not ranked_papers or top_score < 0.6:
        if iteration < 3:
            return "refine_query"  # Loop back
    return "save_to_context"  # Exit loop
```

#### `should_revise_draft()`
```python
def should_revise_draft(state: ResearchState) -> str:
    if needs_revision and revision_count < 2:
        return "writer"  # Loop back
    return "reviewer_approved"  # Exit loop
```

---

## Data Flow: End-to-End Example

### Scenario: User asks "Write a section on transformer attention mechanisms"

```
1. FRONTEND: User types query in Discovery mode
   ↓
2. API CALL: POST /chat/stream
   {
     "project_id": "abc123",
     "message": "Write a section on transformer attention mechanisms",
     "selected_paper_ids": ["paper1", "paper2"],
     "lab_asset_ids": []
   }
   ↓
3. BACKEND: Receives request, creates initial state
   {
     "query": "Write a section on...",
     "intent": null,
     "selected_paper_ids": ["paper1", "paper2"],
     "logs": [],
     "current_draft": {}
   }
   ↓
4. GRAPH EXECUTION: Starts at Router node
   ├── Router Node:
   │   ├── Calls ai_client.classify_intent(query)
   │   ├── Result: "DRAFT"
   │   └── Updates state: { "intent": "DRAFT" }
   │   └── EMITS SSE: { "type": "log", "data": { "source": "Router", "message": "Classified as DRAFT" } }
   ↓
5. Conditional Edge: route_after_intent()
   ├── Reads state["intent"] == "DRAFT"
   └── Routes to: "planner" (skip search)
   ↓
6. Planner Node (SKIPPED in this example, goes straight to Writer)
   ↓
7. Writer Node:
   ├── Retrieves chunks from vector_store.search_similar()
   │   └── Filters by selected_paper_ids
   ├── Builds prompt with context
   ├── Calls ai_client.generate_text_stream()
   ├── For each chunk from LLM:
   │   └── EMITS SSE: { "type": "text", "data": accumulated_text }
   └── Updates state: { "current_draft": { "content": "..." } }
   ↓
8. Writer → Reviewer Edge
   ↓
9. Reviewer Node:
   ├── Analyzes draft for quality
   ├── Returns: { "needs_revision": False }
   └── EMITS SSE: { "type": "log", "data": { "source": "Reviewer", "message": "Draft approved ✓" } }
   ↓
10. Conditional Edge: should_revise_draft()
    ├── Reads needs_revision == False
    └── Routes to: "reviewer_approved"
    ↓
11. Finalize Node:
    └── EMITS SSE: { "type": "complete", "message": "Workflow completed" }
    ↓
12. FRONTEND: useStreamingChat() hook receives events
    ├── "log" events → addAgentLog() → Updates sidebar
    ├── "text" events → Updates chat message
    └── "complete" → setAgentState(IDLE)
```

**Total Time**: ~10-15 seconds for a 500-word section (depending on LLM speed)

---

## RAG (Retrieval-Augmented Generation) Flow

```
┌─────────────────────────────────────────────────────┐
│                 USER QUERY                          │
│ "What are the limitations of BERT embeddings?"      │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
      ┌───────────────────────────┐
      │  Frontend: User selects   │
      │  papers 1, 2, 3 for context│
      └────────────┬──────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ API Payload:        │
         │ {                   │
         │   query: "...",     │
         │   selected_paper_ids│
         │     : ["1","2","3"] │
         │ }                   │
         └────────┬────────────┘
                  │
                  ▼
    ┌────────────────────────────────┐
    │ Backend: Writer Node           │
    │                                │
    │ vector_store.search_similar(  │
    │   project_id="proj1",          │
    │   query="limitations BERT",    │
    │   paper_ids=["1","2","3"],     │
    │   top_k=5                      │
    │ )                              │
    └────────┬───────────────────────┘
             │
             ▼
  ┌──────────────────────────────────┐
  │ FAISS Index Query (filtered)     │
  │                                  │
  │ For each chunk in index:         │
  │   if chunk.paper_id IN [1,2,3]:  │
  │     compute similarity            │
  │   else:                          │
  │     skip                         │
  └─────────┬────────────────────────┘
            │
            ▼
  ┌─────────────────────────────────┐
  │ Top 5 Chunks Retrieved:         │
  │                                 │
  │ 1. "BERT uses fixed embeddings" │
  │ 2. "Context-free pre-training"  │
  │ 3. "Limits on sequence length"  │
  │ 4. "Computational overhead..."  │
  │ 5. "Fine-tuning challenges..."  │
  └────────┬────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────┐
  │ Prompt Construction:            │
  │                                 │
  │ "You are an academic writer.    │
  │  Use ONLY these sources:        │
  │  [chunk 1...5]                  │
  │                                 │
  │  Write about: limitations BERT" │
  └────────┬────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────┐
  │ LLM Generation                  │
  │ (Grounded in retrieved chunks)  │
  └────────┬────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────┐
  │ OUTPUT:                         │
  │ "BERT embeddings have several   │
  │  limitations. First, they use   │
  │  fixed, context-free pre-       │
  │  training [1]..."               │
  └─────────────────────────────────┘
```

**Key Point**: The filter `paper_ids=["1","2","3"]` ensures the AI **cannot** access papers 4, 5, 6... etc. This prevents hallucination.

---

## Streaming Architecture (SSE)

### Backend: Async Generator Pattern

```python
# chat.py
async def event_generator():
    initial_state = create_initial_state(...)
    
    # Stream graph execution
    async for state in research_graph.astream(initial_state):
        # Extract logs from state
        for log in state.get("logs", []):
            yield f"data: {json.dumps({'type': 'log', 'data': log})}\n\n"
        
        # Extract draft content
        if draft := state.get("current_draft"):
            yield f"data: {json.dumps({'type': 'text', 'data': draft['content']})}\n\n"
    
    yield f"data: {json.dumps({'type': 'complete'})}\n\n"

return StreamingResponse(
    event_generator(),
    media_type="text/event-stream"
)
```

### Frontend: ReadableStream Parser

```typescript
// lib/api-client.ts
async function* streamChatWorkflow(payload) {
  const response = await fetch('/chat/stream', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        yield event;  // { type: 'log' | 'text' | 'complete', data: ... }
      }
    }
  }
}
```

---

## Database Schema

```sql
-- Projects Table
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    mode TEXT,  -- 'RESEARCH' | 'MANUSCRIPT'
    methodology TEXT,
    findings TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Library Items (Papers added to project)
CREATE TABLE library_items (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    title TEXT,
    authors JSON,
    year INTEGER,
    abstract TEXT,
    arxiv_id TEXT,
    pdf_path TEXT,
    relevance_score REAL,
    is_selected_for_context BOOLEAN,
    created_at TIMESTAMP
);

-- Lab Assets (Images, CSVs, etc.)
CREATE TABLE lab_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    name TEXT,
    asset_type TEXT,  -- 'image' | 'data' | 'code'
    file_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    ai_description TEXT,  -- Generated by Vision API
    created_at TIMESTAMP
);
```

---

## Security & CORS

Currently configured for **development only**:

```python
# main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**For production**, restrict origins to your deployed domain:
```python
allow_origins=["https://scholarflow.app"]
```

---

## Performance Considerations

### Vector Search
- **Index Size**: Scales linearly with number of chunks
- **Search Time**: O(N) for flat index (current setup)
- **Optimization**: Use `faiss.IndexIVFFlat` for large datasets (>100k chunks)

### Streaming Latency
- **First Token**: ~1-2 seconds (LLM cold start)
- **Subsequent Tokens**: ~50ms/token (Gemini Flash)
- **Total Section**: ~10-15 seconds for 500 words

### File Storage
- **Current**: Local filesystem
- **Recommendation**: Migrate to S3/Cloudflare R2 for production

---

## Next: Extending the System

### Adding a New Node to LangGraph
1. Define node function in `nodes.py`:
   ```python
   async def my_custom_node(state: ResearchState) -> dict:
       # Your logic here
       return { "custom_field": result }
   ```
2. Add to graph in `graph.py`:
   ```python
   graph.add_node("my_node", my_custom_node)
   graph.add_edge("router", "my_node")
   ```

### Adding a New API Endpoint
1. Create router in `backend/app/api/my_endpoint.py`
2. Register in `main.py`:
   ```python
   from app.api import my_endpoint
   app.include_router(my_endpoint.router)
   ```

### Adding a New Frontend Page
1. Create component in `components/MyPage.tsx`
2. Add route case in `App.tsx`:
   ```typescript
   {viewState === ViewState.MY_PAGE && <MyPage />}
   ```
