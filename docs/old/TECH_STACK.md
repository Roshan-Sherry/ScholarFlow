# ScholarFlow Technology Stack

## Frontend Stack

### Core Framework
- **React 19** - Latest React with Concurrent Features
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool with HMR

### State Management
- **Zustand** - Lightweight state management
  - `useAppStore` - Global app state (view mode, projects)
  - `useProjectStore` - Active project state
  - `useAgentStore` - Agent activity logs and status

### Data Fetching & Caching
- **@tanstack/react-query (v5)** - Server state management
  - Automatic caching and refetching
  - Used for: Projects, Lab Assets, Papers

### PDF Rendering
- **react-pdf (v9.1.1)** - PDF document viewing
- **pdfjs-dist (v4.4.168)** - PDF.js library (backend for react-pdf)

### Code Editor
- **@monaco-editor/react** - Visual Studio Code-style editor
  - Markdown editing with live preview
  - Syntax highlighting
  - Integrated AI assistance

### UI Components & Styling
- **Vanilla CSS** - Custom styling (no Tailwind by choice)
- **lucide-react** - Modern icon library
- **react-markdown** - Markdown rendering for chat messages

### HTTP Client
- **axios** - Promise-based HTTP client
- **fetch** - Native fetch for SSE streaming

---

## Backend Stack

### Core Framework
- **FastAPI** - Modern async Python web framework
  - Type hints with Pydantic
  - Automatic OpenAPI documentation
  - CORS middleware for frontend integration

### Database
- **SQLAlchemy 2.0** - SQL toolkit and ORM
  - Async support
  - Type-safe models
- **SQLite** - Default database (easily swappable to PostgreSQL)
- **Alembic** - Database migrations

### AI/LLM Integration
- **LangChain** - LLM orchestration framework
  - Provider-agnostic LLM interface
  - Message formatting and streaming
- **LangGraph** - Cyclic agent workflow framework
  - State machine for research workflows
  - Conditional edges for loops (Discovery, Review)

### Supported AI Providers
- **Google Gemini** (Default)
  - `ChatGoogleGenerativeAI` - Text and Vision models
  - `gemini-2.0-flash-exp` - Fast model for routing
  - `gemini-2.0-flash-thinking-exp-01-21` - Main reasoning model
- **Ollama** (Local deployment)
  - Supports any llama, mistral variants
  - Vision via `llava` model
- **OpenAI** (Compatible)
  - Official OpenAI API
  - vLLM / Groq / Compatible APIs

### Vector Store
- **FAISS** - Fast similarity search
  - CPU-based vector indexing
  - Project-specific indexes
- **sentence-transformers** - Embedding generation
  - `all-MiniLM-L6-v2` model (384 dimensions)

### File Processing
- **aiofiles** - Async file I/O
- **python-multipart** - Form data & file uploads

### Environment & Config
- **pydantic-settings** - Type-safe configuration
- **python-dotenv** - Environment variable loading

---

## Architecture Patterns

### Frontend Patterns
- **Compound Components** - Modular UI composition (Sidebars, Workspace)
- **Custom Hooks** - Reusable logic encapsulation
  - `useStreaming` - SSE event handling
  - `useLabAssets` - Lab asset CRUD
  - `useProjects` - Project management
- **SSE Streaming** - Real-time agent updates via Server-Sent Events

### Backend Patterns
- **Repository Pattern** - Database abstraction
- **Service Layer** - Business logic separation
  - `VectorStoreService` - RAG operations
  - `LabAnalystService` - Multimodal processing
  - `AIClient` - Unified LLM interface (Singleton)
- **Dependency Injection** - FastAPI's `Depends()` for DB sessions
- **Async/Await** - Non-blocking I/O throughout

---

## Development Tools

### Frontend Dev Tools
- **ESLint** - Code linting
- **TypeScript Compiler** - Type checking
- **Vite Dev Server** - Hot module replacement

### Backend Dev Tools
- **uvicorn** - ASGI server with auto-reload
- **pytest** (optional) - Unit testing framework
- **Alembic** - Database schema versioning

---

## File Structure Summary

```
scholarflow/
├── frontend/
│   ├── components/      # React UI components
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # Zustand state stores
│   ├── lib/            # API client, utilities
│   ├── constants.ts    # Mock data, constants
│   └── types.ts        # TypeScript types
│
├── backend/
│   ├── app/
│   │   ├── api/        # FastAPI route handlers
│   │   ├── agents/     # LangGraph workflow
│   │   ├── core/       # AI client, config
│   │   ├── models/     # SQLAlchemy models, schemas
│   │   └── services/   # Business logic layer
│   ├── uploads/        # File storage
│   ├── data/           # FAISS indexes
│   └── alembic/        # DB migrations
│
└── docs/               # Documentation (this folder)
```

---

## Key Dependencies (package.json / requirements.txt)

**Frontend**:
```json
{
  "react": "^19.0.0",
  "zustand": "^5.0.2",
  "@tanstack/react-query": "^5.62.12",
  "axios": "^1.7.9",
  "react-pdf": "^9.1.1",
  "@monaco-editor/react": "^4.6.0"
}
```

**Backend**:
```
fastapi>=0.115.12
uvicorn[standard]>=0.34.0
sqlalchemy>=2.0.36
langchain>=0.3.20
langgraph>=0.2.65
langchain-google-genai>=2.0.12
faiss-cpu>=1.9.0
sentence-transformers>=3.3.1
aiofiles>=24.1.0
```
