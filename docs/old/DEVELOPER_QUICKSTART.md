# Developer Quick Start Guide

**For developers joining the ScholarFlow integration fixes**

---

## 🚀 Getting Started in 5 Minutes

### 1. Read These First (Priority Order)
1. **This file** (you're here) - 5 min
2. `INTEGRATION_SUMMARY.md` - 10 min overview
3. `INTEGRATION_CHECKLIST.md` - Reference as you work
4. `IMPLEMENTATION_PLAN.md` - When you start coding

### 2. Understand the Current State
- ✅ **Core features work**: Chat streaming, projects, lab assets, PDF search
- 🔴 **3 critical issues**: Discovery results, page reload, no auth
- 🟡 **3 missing features**: Voice, file persistence, outline editing

### 3. Your First Task Options

**Easy (1 hour)** - Remove Page Reload:
- File: [`App.tsx`](../App.tsx) line 219
- Delete: `window.location.reload()`
- Add: `queryClient.invalidateQueries({ queryKey: ['projects'] })`

**Medium (4-6 hours)** - Fix Discovery Results:
- Files: `backend/app/api/chat.py`, `hooks/useStreaming.ts`, `components/WorkspaceDiscovery.tsx`
- See `IMPLEMENTATION_PLAN.md` → Phase 1 → Task 1.1

**Hard (8-12 hours)** - Add Authentication:
- Create: `backend/app/core/auth.py`, `frontend/lib/auth.ts`
- See `IMPLEMENTATION_PLAN.md` → Phase 1 → Task 1.3

---

## 📁 Key Files to Know

### Frontend (React + TypeScript)

```
scholarflow/
├── App.tsx                      ⭐ Main app logic, routing
├── types.ts                     ⭐ All TypeScript types
│
├── lib/
│   └── api-client.ts            ⭐ All API calls, SSE streaming
│
├── hooks/
│   ├── useStreaming.ts          ⭐ Chat/draft streaming logic
│   ├── useProjects.ts           React Query hooks
│   └── useLabAssets.ts          React Query hooks
│
├── stores/
│   ├── appStore.ts              UI state (Zustand)
│   ├── projectStore.ts          ⚠️ Projects/files (NOT persisted)
│   └── agentStore.ts            Agent logs, streaming state
│
├── components/
│   ├── Dashboard.tsx            Home/project list
│   ├── WorkspaceDiscovery.tsx   ⚠️ Research mode (missing papers display)
│   ├── WorkspaceStudio.tsx      Writing mode
│   ├── WorkspaceReading.tsx     PDF viewer
│   ├── SidebarLeft.tsx          Library/Lab/Files
│   └── SidebarRight.tsx         Co-Author/Monitor
│
└── constants.ts                 Mock data, config
```

### Backend (FastAPI + Python)

```
backend/
├── app/
│   ├── main.py                  ⭐ App entry, middleware, CORS
│   │
│   ├── api/
│   │   ├── chat.py              ⭐ Streaming, LangGraph
│   │   ├── projects.py          Project CRUD
│   │   ├── papers.py            Search, upload, RAG
│   │   ├── lab.py               Asset upload, Gemini
│   │   ├── research.py          Q&A endpoints (unused)
│   │   └── voice.py             STT/TTS (unused)
│   │
│   ├── agents/
│   │   ├── graph.py             ⭐ LangGraph workflow
│   │   ├── nodes.py             Agent nodes
│   │   └── state.py             Workflow state
│   │
│   ├── services/
│   │   ├── vector_store.py      FAISS RAG
│   │   ├── pdf_processor.py     Chunking
│   │   ├── paper_search.py      ArXiv + S2
│   │   └── lab_analyst.py       Gemini Vision
│   │
│   ├── models/
│   │   ├── database.py          SQLAlchemy models
│   │   └── schemas.py           Pydantic schemas
│   │
│   └── core/
│       ├── config.py            Settings
│       └── ai_client.py         OpenAI client
│
└── alembic/                     Database migrations
```

---

## 🔍 How to Find Things

### "Where is X feature implemented?"

```bash
# Search for specific functionality
grep -r "function_name" --include="*.tsx" --include="*.ts"

# Find API calls
grep -r "apiClient\." lib/api-client.ts

# Find backend endpoints
grep -r "@router\." backend/app/api/

# Find type definitions
grep -r "interface.*Name" types.ts
```

### Common Search Patterns

| Looking for | Search in | Pattern |
|-------------|-----------|---------|
| API endpoint | `backend/app/api/` | `@router.post("/path")` |
| React hook | `hooks/` | `export function use` |
| Component | `components/` | `export const ComponentName` |
| Type definition | `types.ts` | `interface Name` |
| Store action | `stores/` | `const action =` |
| Database model | `backend/app/models/` | `class Model(Base)` |

---

## 🐛 Debugging Tips

### Frontend Debugging

**Check streaming events:**
```typescript
// In useStreaming.ts, add:
console.log('Stream Event:', event);  // Line 30

// Or in WorkspaceDiscovery.tsx:
console.log('Turn updated:', turn);
```

**Check API calls:**
```typescript
// In api-client.ts interceptor:
console.log('API Request:', config);
console.log('API Response:', response);
```

**Check state:**
```typescript
// In any component:
import { useAppStore } from './stores/appStore';

const state = useAppStore();
console.log('App State:', state);
```

### Backend Debugging

**Enable debug logs:**
```python
# In main.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

**Check streaming:**
```python
# In chat.py
logger.info(f"Stream event: {event_data}")
```

**Check LangGraph state:**
```python
# In agents/graph.py
print(f"State: {state}")
print(f"Node: {node_name}")
```

### Common Issues & Solutions

**Issue**: Papers not showing in Discovery
- **Check**: Backend sending `found` event? → No ❌
- **Fix**: Add event emission (see Phase 1, Task 1.1)

**Issue**: Changes lost on refresh
- **Check**: Are you saving to API? → No ❌
- **Fix**: Files not persisted (see Phase 2, Task 2.2)

**Issue**: Auth errors
- **Check**: Is auth implemented? → No ❌
- **Fix**: Add authentication (see Phase 1, Task 1.3)

**Issue**: CORS errors
- **Check**: `main.py` allows your origin? → Yes ✅
- **Note**: Currently allows all origins (development only)

---

## 🧪 Testing Your Changes

### Frontend Tests

```bash
# Run dev server
npm run dev

# Test specific workflow:
# 1. Open http://localhost:5173
# 2. Click "Literature Review"
# 3. Search for "quantum computing"
# 4. Verify papers appear (will fail until fixed)
# 5. Select papers
# 6. Click "Generate Plan"
# 7. Verify smooth navigation (will reload until fixed)
```

### Backend Tests

```bash
# Run backend
cd backend
python -m app.main

# Test endpoints with curl:
curl -X POST http://localhost:8000/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"project_id": "test", "message": "quantum computing", "selected_paper_ids": [], "lab_asset_ids": []}'

# Expected: Stream of SSE events
# Current issue: No 'found' event
```

### Integration Test

```bash
# 1. Start backend
cd backend && python -m app.main

# 2. Start frontend (new terminal)
cd .. && npm run dev

# 3. Test full workflow
# - Create project
# - Search papers
# - Upload PDF
# - Draft section
# - Verify streaming works
```

---

## 🎯 Your Mission

### Goal
Make ScholarFlow production-ready by fixing critical integration issues.

### Success Criteria
- [ ] Users can see and select discovered papers
- [ ] No page reloads during navigation
- [ ] Basic authentication working
- [ ] Voice input functional
- [ ] Files persist across sessions
- [ ] Outline can be edited

### Timeline
- **Week 1**: Critical fixes (Discovery, reload, auth)
- **Week 2**: High priority (Voice, files, outline)
- **Week 3**: Polish and testing

---

## 📚 Learning Resources

### Already Know These?
- React + TypeScript
- React Query
- Zustand
- FastAPI
- SQLAlchemy
- SSE (Server-Sent Events)

### Need to Learn?
- **LangGraph**: [docs](https://python.langchain.com/docs/langgraph)
- **FAISS**: [docs](https://github.com/facebookresearch/faiss)
- **React Query**: [docs](https://tanstack.com/query/latest)
- **Zustand**: [docs](https://github.com/pmndrs/zustand)

---

## 🤝 Getting Help

### When Stuck
1. Check `DEEP_INTEGRATION_ANALYSIS.md` for context
2. Search codebase with grep
3. Read existing code comments
4. Check console logs (browser + backend)
5. Ask team lead

### Useful Commands

```bash
# Find where something is used
grep -r "functionName" .

# See all API endpoints
grep -r "@router" backend/app/api/

# See all React components
ls components/*.tsx

# Check database schema
cat backend/app/models/database.py

# See what's in the database
docker exec -it postgres psql -U user -d scholarflow
\dt  # List tables
SELECT * FROM projects;
```

---

## 📝 Before You Start Coding

### Checklist
- [ ] Read `INTEGRATION_SUMMARY.md`
- [ ] Understand the issue you're fixing
- [ ] Know which files to modify
- [ ] Have development environment running
- [ ] Created a feature branch
- [ ] Read the relevant section in `IMPLEMENTATION_PLAN.md`

### Development Environment

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python -m app.main

# Frontend (new terminal)
npm install
npm run dev

# Database (if needed)
docker-compose up -d postgres
```

---

## 🎉 Your First Contribution

**Easiest fix** (great first task):

### Remove Page Reload (30 minutes)

**File**: `App.tsx`

**Find** (around line 219):
```tsx
window.location.reload(); // Simplest way to ensure everything syncs
```

**Replace with**:
```tsx
queryClient.invalidateQueries({ queryKey: ['projects'] });
```

**Add at top** (if not already there):
```tsx
import { useQueryClient } from '@tanstack/react-query';

export default function App() {
    const queryClient = useQueryClient();
    // ... rest
}
```

**Test**:
1. Go to Discovery mode
2. Select papers
3. Click "Generate Plan"
4. ✅ Should navigate smoothly without reload

**Commit**:
```bash
git checkout -b fix/remove-page-reload
git add App.tsx
git commit -m "fix: remove page reload after project generation

- Replace window.location.reload() with React Query invalidation
- Improves UX with smooth navigation
- Preserves application state

Resolves: Phase 1, Task 1.2"
git push origin fix/remove-page-reload
```

---

## 🚢 When You're Done

### Before Submitting PR
- [ ] Code works locally
- [ ] No console errors
- [ ] Tested the workflow end-to-end
- [ ] Updated documentation if needed
- [ ] Followed code style (Prettier/ESLint)
- [ ] Wrote clear commit message

### PR Template

```markdown
## Description
Brief description of what you fixed

## Changes
- Changed X in file Y
- Added Z to file W

## Testing
- [ ] Tested locally
- [ ] Verified no regression
- [ ] Checked console for errors

## Related
- Phase 1, Task 1.X from IMPLEMENTATION_PLAN.md
- Fixes issue #123 (if applicable)

## Screenshots
(if UI changes)
```

---

## 🎓 Pro Tips

### Frontend
- Use React DevTools to inspect component state
- Check Network tab for API calls
- Use Zustand DevTools for state debugging
- TypeScript errors? Check `types.ts`

### Backend
- Use `/docs` for interactive API testing
- Check logs in `backend/logs/`
- Use `pdb.set_trace()` for debugging
- SQLAlchemy queries? Add `.all()` to see results

### Integration
- SSE events not arriving? Check backend logs
- CORS issues? Check `main.py` middleware
- Type mismatches? Check transformation in `api-client.ts`
- State not updating? Check Zustand store actions

---

## 📞 Who to Contact

### Questions About
- **Architecture**: Check `ARCHITECTURE_MAP.md`
- **Specific feature**: Check `DEEP_INTEGRATION_ANALYSIS.md`
- **How to fix X**: Check `IMPLEMENTATION_PLAN.md`
- **What's broken**: Check `INTEGRATION_CHECKLIST.md`

### Document Organization
```
docs/
├── INTEGRATION_SUMMARY.md          ← Start here
├── INTEGRATION_CHECKLIST.md        ← Track progress
├── IMPLEMENTATION_PLAN.md          ← How to fix
├── DEEP_INTEGRATION_ANALYSIS.md    ← Deep dive
├── ARCHITECTURE_MAP.md             ← Visual guide
└── DEVELOPER_QUICKSTART.md         ← This file
```

---

## ✅ Ready to Code!

You now know:
- ✅ What's working and what's broken
- ✅ Where to find key files
- ✅ How to debug issues
- ✅ How to test your changes
- ✅ Where to get help

**Next step**: Pick a task from `INTEGRATION_CHECKLIST.md` and jump into `IMPLEMENTATION_PLAN.md`!

---

**Good luck!** 🚀

**Questions?** Re-read the relevant docs or ask your team lead.

**Document Updated**: January 28, 2026
