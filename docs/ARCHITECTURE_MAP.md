# ScholarFlow Architecture & Integration Map

**Visual Guide to System Status**

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TypeScript)                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Dashboard   │  │  Discovery   │  │    Studio    │              │
│  │   (Home)     │  │  (Research)  │  │  (Writing)   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┼──────────────────┘                      │
│                            │                                          │
│  ┌─────────────────────────▼───────────────────────────┐            │
│  │          State Management (Zustand)                  │            │
│  │  • appStore (UI state)                               │            │
│  │  • projectStore (project/files)   ✅ NOT PERSISTED  │            │
│  │  • agentStore (logs, streaming)                      │            │
│  └─────────────────────────┬───────────────────────────┘            │
│                             │                                         │
│  ┌─────────────────────────▼───────────────────────────┐            │
│  │         React Query (Data Fetching & Cache)          │            │
│  │  • useProjects()            ✅ Working               │            │
│  │  • useLabAssets()           ✅ Working               │            │
│  │  • useStreamingChat()       ✅ Working               │            │
│  └─────────────────────────┬───────────────────────────┘            │
│                             │                                         │
│  ┌─────────────────────────▼───────────────────────────┐            │
│  │         API Client (Axios + SSE Fetch)               │            │
│  │  • HTTP Calls: axios                                 │            │
│  │  • SSE Streaming: fetch() + ReadableStream          │            │
│  │  • Type Transformations: backend → frontend         │            │
│  └─────────────────────────┬───────────────────────────┘            │
│                             │                                         │
└─────────────────────────────┼─────────────────────────────────────┘
                               │
                               │ HTTP/SSE
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      BACKEND (FastAPI + Python)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────┐            │
│  │                API Endpoints (FastAPI)               │            │
│  │                                                       │            │
│  │  /projects         ✅ CRUD                           │            │
│  │  /papers           ✅ Search + Upload                │            │
│  │  /lab              ✅ Assets + Gemini Vision         │            │
│  │  /chat/stream      ⚠️ Missing 'found' event         │            │
│  │  /chat/draft       ✅ Section drafting               │            │
│  │  /research         ✅ Q&A (UNUSED by frontend)       │            │
│  │  /voice            ✅ STT/TTS (UNUSED by frontend)   │            │
│  │  /files            ❌ NOT IMPLEMENTED                │            │
│  │  /auth             ❌ NOT IMPLEMENTED                │            │
│  └─────────────────────┬───────────────────────────────┘            │
│                        │                                              │
│  ┌─────────────────────▼───────────────────────────────┐            │
│  │              LangGraph Agents                        │            │
│  │  • Planner   → Outline generation                    │            │
│  │  • Router    → Intent classification                 │            │
│  │  • Ranker    → Paper relevance                       │            │
│  │  • Writer    → Draft generation                      │            │
│  │  • Reviewer  → Quality check                         │            │
│  └─────────────────────┬───────────────────────────────┘            │
│                        │                                              │
│  ┌─────────────────────▼───────────────────────────────┐            │
│  │              Services Layer                          │            │
│  │  • Vector Store (FAISS)         ✅                   │            │
│  │  • PDF Processor (PyMuPDF)      ✅                   │            │
│  │  • Paper Search (ArXiv+S2)      ✅                   │            │
│  │  • AI Clients (OpenAI/Gemini)   ✅                   │            │
│  │  • Lab Analyst (Vision)         ✅                   │            │
│  │  • Voice Service (Whisper)      ✅ UNUSED            │            │
│  └─────────────────────┬───────────────────────────────┘            │
│                        │                                              │
│  ┌─────────────────────▼───────────────────────────────┐            │
│  │                 Database (PostgreSQL)                │            │
│  │  • projects        ✅                                │            │
│  │  • library_items   ✅                                │            │
│  │  • lab_assets      ✅                                │            │
│  │  • project_files   ❌ Missing table                  │            │
│  │  • users           ❌ Missing table                  │            │
│  └─────────────────────────────────────────────────────┘            │
│                                                                       │
└───────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Discovery Workflow

### Current (Broken) Flow

```
User enters query
        │
        ▼
Frontend: Discovery.tsx
        │
        ▼
useStreamingChat hook
        │
        ▼
streamChatWorkflow(payload)
        │
        ▼ HTTP POST
Backend: /chat/stream
        │
        ▼
research_graph.astream()
        │
        ├──▶ Router Node  ──▶  logs: "Analyzing..."
        │                       ✅ SENT to frontend
        │
        ├──▶ Ranker Node  ──▶  found_papers: [...]
        │                       ❌ NOT SENT to frontend
        │                       (Only captured internally)
        │
        └──▶ Complete     ──▶  papers: [...] in complete event
                                ⚠️ TOO LATE - no selection UI

Result: User sees logs but NO PAPERS to select
```

### Fixed Flow (After Phase 1)

```
User enters query
        │
        ▼
Frontend: Discovery.tsx
        │
        ▼
useStreamingChat hook with onPapersFound callback
        │
        ▼
streamChatWorkflow(payload)
        │
        ▼ HTTP POST
Backend: /chat/stream (UPDATED)
        │
        ▼
research_graph.astream()
        │
        ├──▶ Router Node  ──▶  logs: "Analyzing..."
        │                       ✅ SENT
        │
        ├──▶ Ranker Node  ──▶  found_papers: [...]
        │                       ✅ NEW: Emit 'found' event
        │                       yield {type: 'found', papers: [...]}
        │
        │                       ▼
        │                Frontend receives 'found' event
        │                       ▼
        │                onPapersFound([...]) called
        │                       ▼
        │                Update turn.sources with papers
        │                       ▼
        │                Display paper cards with checkboxes
        │                       ▼
        │                User can SELECT papers
        │
        └──▶ Complete     ──▶  final confirmation

Result: ✅ User sees papers and can select them
```

---

## Data Flow: Project Generation

### Current (Poor UX) Flow

```
User clicks "Generate Plan"
        │
        ▼
handleCreateProjectFromDiscovery()
        │
        ▼
api.generateProject(paperIds)
        │
        ▼ HTTP POST /projects/generate
Backend creates project
        │
        ▼ 200 OK + project data
Frontend receives project
        │
        ▼
window.location.reload()  ❌ FULL PAGE REFRESH
        │
        ▼
App remounts, all state lost
        │
        ▼
Poor UX, feels like crash
```

### Fixed Flow (After Phase 1)

```
User clicks "Generate Plan"
        │
        ▼
handleCreateProjectFromDiscovery()
        │
        ▼
api.generateProject(paperIds)
        │
        ▼ HTTP POST /projects/generate
Backend creates project
        │
        ▼ 200 OK + project data
Frontend receives project
        │
        ├──▶ queryClient.invalidateQueries(['projects'])
        │     ▼
        │    React Query refetches in background
        │
        └──▶ handleOpenProject(newProject.id)
              ▼
             Smooth navigation to new project
              ▼
             ✅ No reload, state preserved
```

---

## Feature Connectivity Matrix

### Legend
- 🟢 Fully connected & working
- 🟡 Partially connected or issues
- 🔴 Not connected
- ⚫ Not applicable

```
┌──────────────────────┬──────────┬──────────┬────────────┬─────────┐
│ Feature              │ Frontend │ Backend  │ API Wire   │ Status  │
├──────────────────────┼──────────┼──────────┼────────────┼─────────┤
│ Chat Streaming       │    ✅    │    ✅    │     ✅     │   🟢    │
│ Project CRUD         │    ✅    │    ✅    │     ✅     │   🟢    │
│ Lab Assets           │    ✅    │    ✅    │     ✅     │   🟢    │
│ Paper Search         │    ✅    │    ✅    │     ✅     │   🟢    │
│ PDF Upload           │    ✅    │    ✅    │     ✅     │   🟢    │
│ Section Draft        │    ✅    │    ✅    │     ✅     │   🟢    │
│ PDF Viewer           │    ✅    │    ⚫    │     ✅     │   🟢    │
│ Discovery Results    │    ✅    │    ⚠️    │     ❌     │   🔴    │
│ Project Generate     │    ✅    │    ✅    │     ⚠️     │   🟡    │
│ Research Q&A         │    ⚠️    │    ✅    │     ❓     │   🟡    │
│ Voice Input          │    ❌    │    ✅    │     ❌     │   🔴    │
│ Voice Output         │    ❌    │    ✅    │     ❌     │   🔴    │
│ File Create          │    ⚠️    │    ❌    │     ❌     │   🔴    │
│ File Persist         │    ⚠️    │    ❌    │     ❌     │   🔴    │
│ Outline Edit         │    ❌    │    ❌    │     ❌     │   🔴    │
│ Authentication       │    ❌    │    ❌    │     ❌     │   🔴    │
└──────────────────────┴──────────┴──────────┴────────────┴─────────┘

Score: 7/16 fully working (44%)
       3/16 partial (19%)
       6/16 broken (37%)
```

---

## Event Flow: SSE Streaming

### Events Implemented ✅

```
Frontend                          Backend
   │                                 │
   │    streamChatWorkflow()         │
   ├────────────────────────────────▶│
   │                                 │
   │                      research_graph.astream()
   │                                 │
   │◀────────────────────────────────┤
   │   data: {type: 'start'}         │
   │                                 │
   │◀────────────────────────────────┤
   │   data: {type: 'log', ...}      │
   │   ✅ Router: "Analyzing..."     │
   │                                 │
   │◀────────────────────────────────┤
   │   data: {type: 'log', ...}      │
   │   ✅ Ranker: "Ranking papers"   │
   │                                 │
   │◀────────────────────────────────┤
   │   data: {type: 'text', ...}     │
   │   ✅ Chunk: "Based on..."       │
   │                                 │
   │◀────────────────────────────────┤
   │   data: {type: 'complete'}      │
   │   ✅ Done                        │
```

### Events Missing ❌

```
Frontend                          Backend
   │                                 │
   │    streamChatWorkflow()         │
   ├────────────────────────────────▶│
   │                                 │
   │                      research_graph.astream()
   │                                 │
   │                      [Ranker finds papers]
   │                                 │
   │   ❌ NO EVENT SENT              │
   │   Should send:                  │
   │   {type: 'found',               │
   │    count: 10,                   │
   │    papers: [...]}               │
   │                                 │
   │   Instead: papers only in       │
   │            'complete' event     │
```

---

## Authentication Flow (To Be Implemented)

### Phase 1: Basic JWT Auth

```
User                 Frontend              Backend              Database
  │                     │                     │                     │
  │  Enter credentials  │                     │                     │
  ├────────────────────▶│                     │                     │
  │                     │                     │                     │
  │                     │  POST /auth/token   │                     │
  │                     ├────────────────────▶│                     │
  │                     │                     │                     │
  │                     │                     │  Verify password    │
  │                     │                     ├────────────────────▶│
  │                     │                     │◀────────────────────┤
  │                     │                     │  User found         │
  │                     │                     │                     │
  │                     │                     │  Generate JWT       │
  │                     │                     │  (signed token)     │
  │                     │                     │                     │
  │                     │◀────────────────────┤                     │
  │                     │  {access_token: "eyJ..."                  │
  │                     │   token_type: "bearer"}                   │
  │                     │                     │                     │
  │  ✅ Logged in       │                     │                     │
  │◀────────────────────┤                     │                     │
  │                     │                     │                     │
  │                     │  Store in localStorage                    │
  │                     │  'scholarflow_token'                      │
  │                     │                     │                     │
  │  Use protected      │                     │                     │
  │  feature            │                     │                     │
  ├────────────────────▶│                     │                     │
  │                     │                     │                     │
  │                     │  POST /projects     │                     │
  │                     │  Headers:           │                     │
  │                     │  Authorization:     │                     │
  │                     │  Bearer eyJ...      │                     │
  │                     ├────────────────────▶│                     │
  │                     │                     │                     │
  │                     │                     │  Verify JWT         │
  │                     │                     │  Decode user_id     │
  │                     │                     │                     │
  │                     │                     │  ✅ Authorized      │
  │                     │                     │  Process request    │
  │                     │                     │                     │
  │                     │◀────────────────────┤                     │
  │                     │  Project created    │                     │
  │◀────────────────────┤                     │                     │
  │  Success!           │                     │                     │
```

---

## Component Hierarchy

```
App
├── ErrorBoundary
│   └── Dashboard
│       ├── ProjectCard (×N)
│       └── CreateProjectModal
│
├── ErrorBoundary
│   └── Discovery Mode
│       ├── SidebarLeft (Library)
│       │   ├── PaperList
│       │   └── UploadPDF
│       │
│       ├── WorkspaceDiscovery (Main)
│       │   ├── SearchBar
│       │   ├── ResearchTurn (×N)
│       │   │   ├── UserQuery
│       │   │   └── AgentResponse
│       │   │       ├── ThinkingLogs
│       │   │       ├── FoundPapers  ❌ NOT SHOWN
│       │   │       └── Answer
│       │   └── SelectionActions
│       │
│       └── SidebarRight (Monitor)
│           ├── AgentAvatar
│           └── LogsList
│
└── ErrorBoundary
    └── Studio Mode
        ├── SidebarLeft (Library + Lab)
        │   ├── PaperList
        │   ├── AssetList
        │   └── FileTree  ⚠️ NOT PERSISTED
        │
        ├── WorkspaceStudio (Editor)
        │   ├── Toolbar
        │   ├── TemplateSelector
        │   └── Editor (Monaco/Visual)
        │
        └── SidebarRight (Co-Author)
            ├── Tabs
            │   ├── PLAN
            │   │   ├── OutlineSection (×N)
            │   │   │   ├── DraftButton
            │   │   │   └── StatusIndicator
            │   │   └── AutoWriteAll
            │   │
            │   ├── LIBRARY
            │   │   └── PaperSelector
            │   │
            │   └── ASSETS
            │       └── AssetSelector
            │
            └── ChatInterface
                ├── MessageList
                ├── VoiceInput  ❌ NOT IMPLEMENTED
                └── TextInput
```

---

## Database Schema

### Current Tables ✅

```sql
-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT,
    mode VARCHAR,  -- 'RESEARCH' | 'MANUSCRIPT'
    methodology TEXT,
    findings TEXT,  -- Stores outline JSON (unconventional)
    current_phase VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Library Items (Papers)
CREATE TABLE library_items (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title VARCHAR,
    authors TEXT[],
    year INTEGER,
    abstract TEXT,
    pdf_path VARCHAR,
    arxiv_id VARCHAR,
    doi VARCHAR,
    chunk_count INTEGER,
    is_selected_for_context BOOLEAN,
    created_at TIMESTAMP
);

-- Lab Assets
CREATE TABLE lab_assets (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    name VARCHAR,
    asset_type VARCHAR,  -- 'image' | 'data' | 'code'
    file_path VARCHAR,
    ai_description TEXT,
    created_at TIMESTAMP
);
```

### Missing Tables ❌

```sql
-- Users (for authentication)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR UNIQUE NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Project Files (for persistence)
CREATE TABLE project_files (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL,  -- 'file' | 'folder'
    content TEXT,
    parent_id UUID REFERENCES project_files(id),
    extension VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Project Outlines (proper storage)
CREATE TABLE project_outlines (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    sections JSONB NOT NULL,  -- Array of outline sections
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- User Projects (multi-tenancy)
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE library_items ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE lab_assets ADD COLUMN user_id UUID REFERENCES users(id);
```

---

## API Endpoints Status

### Implemented & Working ✅

```
GET    /health                     ✅ Health check
GET    /                           ✅ API info

GET    /projects                   ✅ List projects
POST   /projects                   ✅ Create project
GET    /projects/{id}              ✅ Get project
DELETE /projects/{id}              ✅ Delete project
POST   /projects/generate          ✅ Generate from papers

GET    /papers/search              ✅ Search papers
POST   /papers/upload              ✅ Upload PDF
GET    /papers/{id}                ✅ Get paper

POST   /lab/projects/{id}/upload   ✅ Upload asset
GET    /lab/projects/{id}          ✅ List assets
POST   /lab/assets/{id}/reanalyze  ✅ Re-analyze
DELETE /lab/assets/{id}            ✅ Delete asset

POST   /chat/stream                ⚠️ Works but missing events
POST   /chat/draft-section         ✅ Stream drafting

POST   /research/answer            ✅ Q&A (unused)
POST   /research/stream-search     ✅ Streaming Q&A (unused)

POST   /voice/transcribe           ✅ STT (unused)
POST   /voice/synthesize           ✅ TTS (unused)
POST   /voice/synthesize/stream    ✅ Streaming TTS (unused)
```

### Missing ❌

```
POST   /auth/token                 ❌ Login
POST   /auth/register              ❌ Register
POST   /auth/refresh               ❌ Refresh token
POST   /auth/logout                ❌ Logout

POST   /files                      ❌ Create file
GET    /files/project/{id}         ❌ List files
PATCH  /files/{id}                 ❌ Update file
DELETE /files/{id}                 ❌ Delete file

POST   /outlines                   ❌ Save outline
PUT    /outlines/{id}              ❌ Update outline
GET    /outlines/project/{id}      ❌ Get outline
```

---

## Priority Matrix

```
                    High Impact
                        │
           Broken       │       Working
          Discovery  ────┼────  Chat Stream
            Results      │      Lab Assets
                         │      Projects
                         │
      ──────────────────────────────────
                         │
          File           │      Research Q&A
       Persistence       │      Comparison
                         │
                    Low Impact
```

---

## Timeline Visualization

```
Week 1: Critical Fixes 🔴
├─ Day 1-2: Discovery Results
├─ Day 3:   Page Reload Fix
└─ Day 4-5: Authentication

Week 2: High Priority 🟡
├─ Day 1-2: Voice Integration
├─ Day 3-4: File Persistence
└─ Day 5:   Outline Editing

Week 3: Polish 🟢
├─ Day 1-2: Progress Indicators
├─ Day 3-4: Optimistic Updates
└─ Day 5:   Testing & QA

Week 4+: Advanced Features
└─ WebSocket, Offline, etc.
```

---

## Testing Coverage

```
Feature Tests:
✅ Project CRUD
✅ Lab asset upload
✅ Paper search
⚠️ Discovery flow (partial)
❌ Voice features
❌ File persistence
❌ Authentication

Integration Tests:
✅ SSE streaming
✅ RAG pipeline
⚠️ Discovery → Generate
❌ End-to-end workflows

Unit Tests:
⚠️ Backend: Some coverage
❌ Frontend: Minimal
❌ E2E: None
```

---

## Deployment Readiness

```
Requirements for Production:

Security:
❌ Authentication
❌ HTTPS
❌ Rate limiting
❌ Input validation

Stability:
✅ Error handling
✅ Logging
⚠️ Database migrations
❌ Backups

Performance:
✅ API caching
⚠️ Bundle optimization
❌ CDN
❌ Load balancing

Monitoring:
❌ Error tracking (Sentry)
❌ Analytics
❌ Uptime monitoring
❌ Performance metrics

Score: 2/15 requirements met (13%)
Status: NOT READY for production
```

---

**Document Purpose**: Visual reference for system architecture and integration status  
**Last Updated**: January 28, 2026  
**Maintainer**: Development Team
