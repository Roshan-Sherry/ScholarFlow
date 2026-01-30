# ScholarFlow Setup Guide

## Prerequisites

### Required Software
- **Node.js** 18+ (for frontend)
- **Python** 3.11+ (for backend)
- **Git** (for version control)

### Optional but Recommended
- **VSCode** - IDE with React + Python extensions
- **Ollama** (if using local LLMs instead of Gemini)

---

## Backend Setup

### 1. Navigate to Project Root
```bash
cd scholarflow
```

### 2. Create Python Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies
```bash
pip install -r backend/requirements.txt
```

**Common Issues**:
- If `faiss-cpu` fails, ensure you have a compatible Python version (3.11 recommended)
- On Windows, install Visual C++ Build Tools if needed

### 4. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# === AI PROVIDER CONFIGURATION ===
# Options: "gemini", "ollama", "openai"
LLM_PROVIDER=gemini

# === GEMINI CONFIGURATION (if using Gemini) ===
GOOGLE_API_KEY=your_gemini_api_key_here
TEXT_MODEL_NAME=gemini-2.0-flash-thinking-exp-01-21
FAST_MODEL_NAME=gemini-2.0-flash-exp
# Vision model name (optional, defaults to text model for Gemini)
# VISION_MODEL_NAME=gemini-2.0-flash-exp

# === OLLAMA CONFIGURATION (if using Ollama) ===
# LLM_PROVIDER=ollama
# LLM_BASE_URL=http://localhost:11434
# TEXT_MODEL_NAME=llama3
# FAST_MODEL_NAME=llama3:instruct
# VISION_MODEL_NAME=llava

# === OPENAI CONFIGURATION (if using OpenAI/vLLM/Groq) ===
# LLM_PROVIDER=openai
# LLM_BASE_URL=https://api.openai.com/v1  # or vLLM endpoint
# TEXT_MODEL_NAME=gpt-4-turbo
# FAST_MODEL_NAME=gpt-3.5-turbo
# VISION_MODEL_NAME=gpt-4-vision-preview

# === DATABASE ===
DATABASE_URL=sqlite:///./scholarflow.db

# === UPLOAD & STORAGE PATHS ===
UPLOAD_PATH=uploads
FAISS_INDEX_PATH=data/faiss

# === WORKFLOW SETTINGS ===
MAX_SEARCH_ITERATIONS=3
MAX_REVISION_ITERATIONS=2
RELEVANCE_THRESHOLD=0.6
```

#### How to Get API Keys:

**Google Gemini**:
1. Go to [https://ai.google.dev/](https://ai.google.dev/)
2. Sign in with Google account
3. Click "Get API Key" → Create new key
4. Copy key to `.env` file

**OpenAI**:
1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create new secret key
3. Copy to `.env` as `GOOGLE_API_KEY` (reused for convenience)

### 5. Initialize Database
```bash
python backend/init_db.py
```

This creates:
- SQLite database file
- Upload directories
- FAISS index directories

### 6. Run Backend Server
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**Expected Output**:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Frontend Setup

### 1. Open New Terminal (keep backend running)

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Configure Frontend Environment

Create a `.env.local` file in the project root (NOT in `backend/`):

```env
VITE_API_URL=http://localhost:8000/api/v1
```

### 4. Run Frontend Dev Server
```bash
npm run dev
```

**Expected Output**:
```
VITE v6.0.0  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### 5. Open in Browser
Navigate to [http://localhost:5173](http://localhost:5173)

You should see the ScholarFlow dashboard.

---

## Testing the Setup

### 1. Create a New Project
- Click "New Literature Review" or "New Manuscript"
- Enter a title and description
- Click "Create Project"

### 2. Upload a Lab Asset (Optional)
- Switch to Studio Mode (bottom left)
- Click "Upload Asset" in left sidebar
- Select an image (e.g., a chart/graph)
- Wait for vision analysis to complete
- Check that AI description is generated

### 3. Test Chat/Streaming
- In Discovery mode, ask a question (e.g., "What are transformers in AI?")
- Observe real-time logs in the right sidebar
- Verify agent responds (currently uses mock data for papers)

### 4. Test Studio Drafting
- In Studio mode, click "Generate Plan" in right sidebar
- Wait for outline to appear
- Click "Draft Section" on any section
- Watch text stream into the editor

---

## Common Issues & Troubleshooting

### Backend Won't Start
**Symptom**: `ModuleNotFoundError` or import errors

**Fix**:
```bash
# Verify virtual environment is activated
# Windows: You should see (venv) in terminal
# Re-install dependencies
pip install -r backend/requirements.txt
```

### Gemini API Errors
**Symptom**: `401 Unauthorized` or `API key not valid`

**Fix**:
1. Double-check API key in `.env`
2. Ensure no extra spaces around the key
3. Verify key is active in Google AI Studio

### Frontend Can't Connect to Backend
**Symptom**: `Network Error` in browser console

**Fix**:
1. Verify backend is running (`http://localhost:8000/docs` should load)
2. Check CORS settings in `backend/app/main.py`
3. Ensure `VITE_API_URL` in `.env.local` matches backend URL

### FAISS Installation Fails
**Symptom**: `error: Microsoft Visual C++ 14.0 or greater is required`

**Fix (Windows)**:
1. Install Visual Studio Build Tools: [https://visualstudio.microsoft.com/downloads/](https://visualstudio.microsoft.com/downloads/)
2. Select "Desktop development with C++" workload
3. Retry `pip install faiss-cpu`

**Alternative**: Use `faiss-cpu` pre-built wheels from conda

### PDF Upload Fails
**Symptom**: `413 Payload Too Large`

**Fix**: Increase upload size limit in `backend/app/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    ...
    max_body_size=50 * 1024 * 1024  # 50MB
)
```

---

## Development Commands

### Backend Commands
```bash
# Run with auto-reload
uvicorn app.main:app --reload --port 8000

# Reset database
python backend/reset_db.py

# Create new migration
cd backend
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

### Frontend Commands
```bash
# Development server
npm run dev

# Type checking
npx tsc --noEmit

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Production Deployment (Optional)

### Backend (Uvicorn + Gunicorn)
```bash
pip install gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend (Static Build)
```bash
npm run build
# Deploy 'dist/' folder to Netlify, Vercel, or Nginx
```

### Database Migration (SQLite → PostgreSQL)
1. Update `DATABASE_URL` in `.env`:
   ```env
   DATABASE_URL=postgresql://user:password@localhost/scholarflow
   ```
2. Install PostgreSQL driver:
   ```bash
   pip install psycopg2-binary
   ```
3. Run migrations:
   ```bash
   alembic upgrade head
   ```

---

## Environment Variables Reference

### Backend `.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `gemini` | AI provider: gemini, ollama, openai |
| `GOOGLE_API_KEY` | *required* | API key for Gemini or OpenAI |
| `TEXT_MODEL_NAME` | `gemini-2.0-flash-thinking-exp-01-21` | Main reasoning model |
| `FAST_MODEL_NAME` | `gemini-2.0-flash-exp` | Fast model for routing |
| `VISION_MODEL_NAME` | *(text model)* | Vision-capable model |
| `DATABASE_URL` | `sqlite:///./scholarflow.db` | Database connection string |
| `UPLOAD_PATH` | `uploads` | File storage directory |
| `FAISS_INDEX_PATH` | `data/faiss` | Vector index storage |
| `MAX_SEARCH_ITERATIONS` | `3` | Discovery loop max retries |
| `MAX_REVISION_ITERATIONS` | `2` | Review loop max revisions |
| `RELEVANCE_THRESHOLD` | `0.6` | Min relevance score (0.0-1.0) |

### Frontend `.env.local`

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000/api/v1` | Backend API base URL |

---

## Next Steps

After setup is complete:

1. **Explore the UI**: Try creating projects, uploading PDFs, using the chat
2. **Read Documentation**: Check `FEATURES.md` for implementation details
3. **Customize Prompts**: Edit `backend/app/agents/prompts.py` for your domain
4. **Add Real Search**: Implement arXiv API in `backend/app/agents/nodes.py`
5. **Deploy**: Follow production deployment guide for public access

---

## Support & Resources

- **API Docs**: http://localhost:8000/docs (when backend is running)
- **LangGraph Docs**: https://langchain-ai.github.io/langgraph/
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **React Query**: https://tanstack.com/query/latest

For issues, check the GitHub repository or documentation files in `docs/`.
