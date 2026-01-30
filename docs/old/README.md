# ScholarFlow Documentation

Welcome to the ScholarFlow documentation. This folder contains comprehensive guides and technical documentation for the ScholarFlow AI Research Operating System.

---

## 📚 Documentation Index

### Getting Started

- **[SETUP.md](./SETUP.md)** - Complete installation and setup guide
  - Prerequisites and dependencies
  - Backend and frontend setup
  - Environment configuration
  - Troubleshooting common issues

### System Overview

- **[TECH_STACK.md](./TECH_STACK.md)** - Technology stack documentation
  - Frontend technologies (React 19, TypeScript, Zustand)
  - Backend technologies (FastAPI, LangGraph, FAISS)
  - AI/LLM integration (Gemini, Ollama, OpenAI)
  - Development tools

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and workflows
  - High-level overview diagrams
  - Component breakdown
  - LangGraph workflow deep dive
  - Data flow examples
  - RAG (Retrieval-Augmented Generation) flow
  - Streaming architecture

### Features & Implementation

- **[FEATURES.md](./FEATURES.md)** - Feature implementation status
  - Fully implemented features (Lab, Cyclic Workflow, Streaming, etc.)
  - Partially implemented features
  - Missing features and roadmap
  - Critical feature audit summary

### Audit Reports

- **[AUDIT_REPORT.md](./AUDIT_REPORT.md)** - Comprehensive system audit
  - Executive summary
  - Detailed feature verification
  - Security issues
  - Performance analysis
  - Code quality assessment
  - Production readiness evaluation
  - Recommendations

---

## 🎯 Quick Start

If you're new to ScholarFlow:

1. **Start with [SETUP.md](./SETUP.md)** to get the system running locally
2. **Read [FEATURES.md](./FEATURES.md)** to understand what's implemented
3. **Refer to [ARCHITECTURE.md](./ARCHITECTURE.md)** to understand how it works
4. **Check [TECH_STACK.md](./TECH_STACK.md)** for technology details

---

## 🔑 Key Concepts

### The Five Critical Features

ScholarFlow is built around five core capabilities:

1. **🧪 The Lab** - Multimodal data processing with Vision AI
2. **🧠 Cyclic Workflow** - LangGraph-based agent loops (Discovery + Review)
3. **⚡ Real-Time Streaming** - Server-Sent Events for live updates
4. **🎯 Context Isolation** - RAG filtering by selected papers
5. **✍️ Studio Mode** - Co-authoring with intent-based routing

All five features are **fully implemented** and functional.

---

## 📋 System Requirements

### Backend
- Python 3.11+
- 2GB RAM minimum (4GB recommended)
- Google Gemini API key (or Ollama for local deployment)

### Frontend
- Node.js 18+
- Modern web browser (Chrome, Firefox, Edge)

---

## 🏗️ Architecture Overview

```
Frontend (React)  ←─ SSE ─→  FastAPI Backend
     │                            │
     │                            ├─ LangGraph (Agent Workflow)
     │                            ├─ FAISS (Vector Search)
     │                            ├─ SQLAlchemy (Database)
     └─ Zustand (State)           └─ AI Client (Multi-Provider)
```

---

## 🚀 Development Workflow

### Running Locally
```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload

# Terminal 2: Frontend
npm run dev
```

### Common Tasks
- **Add a new agent node**: Edit `backend/app/agents/nodes.py` and `graph.py`
- **Add a new API endpoint**: Create router in `backend/app/api/`
- **Add a new UI component**: Create file in `components/`
- **Modify prompts**: Edit `backend/app/agents/prompts.py`

---

## 📈 Production Deployment

### Checklist
- [ ] Add authentication (OAuth2/JWT)
- [ ] Set up PostgreSQL database
- [ ] Configure CORS for production domain
- [ ] Set up file storage (S3/Cloudflare R2)
- [ ] Deploy backend with Gunicorn
- [ ] Build and deploy frontend to CDN
- [ ] Set up monitoring and logging

See [AUDIT_REPORT.md](./AUDIT_REPORT.md) for detailed production readiness assessment.

---

## 🐛 Troubleshooting

Common issues and solutions:

| Issue | Solution | Reference |
|-------|----------|-----------|
| Backend won't start | Check virtual environment activation | [SETUP.md](./SETUP.md#backend-wont-start) |
| Gemini API errors | Verify API key in `.env` | [SETUP.md](./SETUP.md#gemini-api-errors) |
| Frontend connection errors | Check CORS and backend URL | [SETUP.md](./SETUP.md#frontend-cant-connect-to-backend) |
| FAISS installation fails | Install Visual C++ Build Tools (Windows) | [SETUP.md](./SETUP.md#faiss-installation-fails) |

---

## 📖 API Documentation

When the backend is running, visit:
- **Interactive API Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🤝 Contributing

### Code Style
- **Frontend**: TypeScript with strict mode
- **Backend**: Type hints with Pydantic validation
- **Formatting**: Prettier (frontend), Black (backend)

### Adding Documentation
- Create new `.md` files in this folder
- Update this README index
- Use clear headers and code examples

---

## 📊 Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Core Workflow | ✅ Complete | LangGraph with 2 loops |
| Vision AI | ✅ Complete | Lab asset analysis |
| SSE Streaming | ✅ Complete | Real-time updates |
| RAG Filtering | ✅ Complete | Context isolation |
| Studio Mode | ✅ Complete | Co-authoring UI |
| Paper Search | ⚠️ Mocked | Needs arXiv API |
| Authentication | ❌ Missing | Critical for prod |
| Tests | ❌ Missing | Recommended |

**Overall**: Production-ready with noted gaps (see [AUDIT_REPORT.md](./AUDIT_REPORT.md))

---

## 🔗 External Resources

### AI/LLM
- [Google Gemini API](https://ai.google.dev/)
- [LangChain Documentation](https://python.langchain.com/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

### Frontend
- [React 19 Docs](https://react.dev/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [React Query (TanStack)](https://tanstack.com/query/)

### Backend
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/)
- [FAISS Wiki](https://github.com/facebookresearch/faiss/wiki)

---

## 📝 License

*Note: Add license information here if applicable*

---

## 📧 Support

For questions or issues:
1. Check the relevant documentation file
2. Review the [AUDIT_REPORT.md](./AUDIT_REPORT.md) troubleshooting section
3. Consult the API docs at http://localhost:8000/docs

---

**Last Updated**: 2026-01-06  
**Documentation Version**: 1.0  
**System Version**: Beta
