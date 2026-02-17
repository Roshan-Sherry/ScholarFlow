# Quick Start Guide - Research Mode

## Running the Backend

```bash
cd backend
uvicorn app.main:app --reload
```

**Note:** The command is `app.main:app` (not `main:app`) because main.py is inside the app/ directory.

## Running the Frontend

```bash
# In another terminal
npm run dev
```

## Testing Research Mode

### 1. Health Check
```bash
curl http://localhost:8000/health
```

### 2. Test Research Question
```bash
curl -X POST http://localhost:8000/api/v1/research/answer \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are transformer attention mechanisms?",
    "max_papers": 3
  }'
```

### 3. Test Streaming Search
```bash
curl -N -X POST http://localhost:8000/api/v1/research/stream-search \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Recent advances in NLP",
    "max_papers": 5
  }'
```

## API Documentation

Once running, visit:
- **Interactive docs:** http://localhost:8000/docs
- **Health check:** http://localhost:8000/health

## Troubleshooting

### "Could not import module 'main'"
❌ Wrong: `uvicorn main:app`
✅ Correct: `uvicorn app.main:app`

### "No module named 'arxiv'"
```bash
pip install arxiv
```

### "No module named 'pdfplumber'"
```bash
pip install pdfplumber  # Optional, for better PDF processing
```

## Environment Variables

Make sure `.env` exists in backend directory:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:///./data/scholarflow.db
```
