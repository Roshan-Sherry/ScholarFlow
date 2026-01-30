# Multi-Agent System Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Backend running on `http://localhost:8000`
- Frontend running with environment variables configured
- Database initialized with projects

---

## 🔧 Backend Setup

### 1. Install Dependencies (if not already done)
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start Backend Server
```bash
cd backend
python -m app.main
# or
uvicorn app.main:app --reload --port 8000
```

### 3. Verify Multi-Agent System
Test the new endpoints:

```bash
# Health check
curl http://localhost:8000/health

# Test proactive suggestions (requires project)
curl -X POST http://localhost:8000/api/v1/agents/proactive-suggestions \
  -H "Content-Type: application/json" \
  -d '{"project_id": "test-id", "selected_paper_ids": [], "current_draft": {}}'
```

---

## 🎨 Frontend Setup

### 1. Add AgentPanel to Dashboard

Edit your main dashboard component (e.g., `App.tsx` or `Dashboard.tsx`):

```tsx
import { AgentPanel } from './components/AgentPanel';

// In your render
<div className="dashboard">
  <SidebarLeft />
  
  <main className="main-content">
    {/* Your existing workspace */}
  </main>
  
  <aside className="sidebar-right">
    <AgentPanel />  {/* Add this */}
  </aside>
</div>
```

### 2. Add Styling (if needed)

```css
.sidebar-right {
  width: 320px;
  height: 100vh;
  overflow: hidden;
  background: #1a1a1a;
  border-left: 1px solid #333;
}
```

---

## 🧪 Testing the Agents

### Test 1: Proactive Suggestions

1. **Create/Open a Project**
2. **Add Papers to Library**
3. **Open AgentPanel** (should appear in right sidebar)
4. **Check Suggestions Tab**
   - Should show workflow suggestions
   - Click suggestions to trigger actions

### Test 2: Memory Insights

1. **Use the Chat/Research Feature** several times
2. **Click "Insights" Tab** in AgentPanel
3. **Verify** key findings, methodologies, and gaps appear

### Test 3: Citation Management

```bash
curl -X POST http://localhost:8000/api/v1/agents/citation-check \
  -H "Content-Type: application/json" \
  -d '{
    "draft_text": "Research shows that transformers improve NLP tasks.",
    "project_id": "your-project-id",
    "citation_style": "IEEE"
  }'
```

Expected response:
```json
{
  "total_citations": 0,
  "suggestions": [...],
  "bibliography": "..."
}
```

### Test 4: Paper Synthesis

1. **Add 3+ Papers** to a project
2. **Call Synthesis Endpoint**:

```bash
curl -X POST http://localhost:8000/api/v1/agents/synthesis \
  -H "Content-Type: application/json" \
  -d '{"project_id": "your-project-id", "focus_area": "methodology"}'
```

Expected: Multi-paper analysis with common themes

---

## 📊 Agent Workflow Examples

### Example 1: Discovery with Synthesis

**User Action**: Search for "transformer models in NLP"

**Behind the Scenes**:
1. ✅ Supervisor: Routes to Search
2. ✅ Memory: Stores query
3. ✅ Search: Finds 8 papers
4. ✅ Ranker: Scores papers
5. ✅ Synthesis: "Common themes: attention mechanisms..."
6. ✅ Citation: Maps papers [1], [2], [3]
7. ✅ Proactive: "💡 Ready to generate outline?"

### Example 2: Draft with Citation Check

**User Action**: Generate introduction section

**Behind the Scenes**:
1. ✅ Supervisor: Routes to Drafting
2. ✅ Memory: Retrieves relevant context
3. ✅ Writer: Generates 400-word intro
4. ✅ Citation: Finds 2 citations, suggests 3 more
5. ✅ Reviewer: "Good structure, expand methodology"
6. ✅ Proactive: "✨ Quality: Good. Consider adding figure."

---

## 🔍 Debugging

### Check Agent Activity

View agent history in state:
```python
# In your endpoint or node
agent_history = state.get("agent_history", [])
for entry in agent_history:
    print(f"{entry['agent']}: {entry['action']}")
```

### Enable Verbose Logging

```python
# In backend/app/core/logging.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Monitor SSE Logs

Agents log their activity to the `logs` field:
```python
{
  "step": "supervisor",
  "source": "Supervisor",
  "message": "🧭 Routing to search agent",
  "status": "processing"
}
```

---

## 📝 Common Issues

### Issue 1: "Agent not responding"

**Solution**: Check if agents are initialized
```python
from app.agents.specialists import get_supervisor_agent
supervisor = get_supervisor_agent()  # Should not raise error
```

### Issue 2: "No suggestions appearing"

**Cause**: No papers selected or draft is empty

**Solution**: 
1. Add papers to project library
2. Create some draft content
3. Refresh AgentPanel

### Issue 3: "Memory not persisting"

**Cause**: Memory agent is in-memory only (singleton)

**Current Behavior**: Memory persists during server uptime

**Future**: Will add database persistence

---

## 🎯 Next Steps

### Immediate
1. ✅ Test all 4 API endpoints
2. ✅ Verify AgentPanel renders
3. ✅ Check suggestions appear
4. ✅ Test citation checking

### Short Term
- [ ] Add database persistence for memory
- [ ] Implement suggestion action handlers
- [ ] Add user preferences UI
- [ ] Create agent activity dashboard

### Long Term
- [ ] Add more specialized agents (validation, collaboration)
- [ ] Implement learning from user feedback
- [ ] Add multi-user coordination
- [ ] Export agent for journal formatting

---

## 📖 API Reference

### POST /api/v1/agents/proactive-suggestions
Returns intelligent suggestions for next actions

**Request**:
```json
{
  "project_id": "string",
  "selected_paper_ids": ["string"],
  "current_draft": {
    "content": "string",
    "section": "string"
  }
}
```

**Response**:
```json
{
  "suggestions": [
    {
      "type": "citation" | "content" | "workflow" | "search",
      "priority": "high" | "medium" | "low",
      "message": "string",
      "action": "string"
    }
  ],
  "quality_feedback": {
    "overall_quality": "string",
    "suggestions": [...],
    "detailed_feedback": "string"
  }
}
```

---

### POST /api/v1/agents/memory-insights
Retrieves research insights from conversation history

**Request**:
```json
{
  "project_id": "string"
}
```

**Response**:
```json
{
  "key_findings": ["string"],
  "methodologies": ["string"],
  "gaps_identified": ["string"],
  "conversation_summary": "string"
}
```

---

### POST /api/v1/agents/citation-check
Checks citations and provides suggestions

**Request**:
```json
{
  "draft_text": "string",
  "project_id": "string",
  "citation_style": "IEEE" | "APA"
}
```

**Response**:
```json
{
  "total_citations": 0,
  "suggestions": [
    {
      "text": "string",
      "reason": "string",
      "suggested_papers": [...]
    }
  ],
  "bibliography": "string"
}
```

---

### POST /api/v1/agents/synthesis
Generates synthesis of papers in project

**Request**:
```json
{
  "project_id": "string",
  "focus_area": "string"  // optional
}
```

**Response**:
```json
{
  "synthesis_summary": "string",
  "comparative_analysis": {
    "comparison_text": "string",
    "aspects_compared": ["string"],
    "paper_count": 0
  },
  "paper_count": 0
}
```

---

## 🎓 Learning Resources

### Understanding the Architecture
- Read: `docs/MULTI_AGENT_ARCHITECTURE.md`
- Study: Agent workflow diagrams
- Review: `backend/app/agents/specialists.py`

### Extending the System
1. Create new agent class in `specialists.py`
2. Add node function in `graph.py`
3. Connect with edges
4. Add API endpoint in `agents.py`
5. Update frontend component

### Example: Adding a ValidationAgent
```python
# In specialists.py
class ValidationAgent:
    async def validate_citations(self, draft, papers):
        # Check if citations are accurate
        pass

# In graph.py
async def validation_node(state):
    agent = get_validation_agent()
    result = await agent.validate_citations(...)
    return {"validation_results": result}

# Add to graph
graph.add_node("validation", validation_node)
graph.add_edge("citation", "validation")
```

---

## ✅ Success Checklist

- [ ] Backend starts without errors
- [ ] All 4 endpoints respond
- [ ] AgentPanel renders in frontend
- [ ] Suggestions tab shows data
- [ ] Insights tab shows memory
- [ ] Quality tab shows feedback (when draft exists)
- [ ] Refresh button works
- [ ] No console errors
- [ ] Agent logs appear in SSE stream

---

## 🆘 Getting Help

### Check Documentation
1. `docs/MULTI_AGENT_ARCHITECTURE.md` - Full architecture
2. `docs/MULTI_AGENT_IMPLEMENTATION_SUMMARY.md` - What was built
3. This file - How to use it

### Debug Steps
1. Check backend logs
2. Verify database has projects
3. Test endpoints with curl
4. Check browser console
5. Review agent_history in state

### Common Solutions
- **No data**: Add papers to project
- **Errors**: Check agent initialization
- **Slow**: Check memory compression settings
- **Wrong suggestions**: Verify state fields are populated

---

## 🎉 You're Ready!

The multi-agent system is fully functional and ready to use. Start with:

1. **Create a project**
2. **Add some papers**
3. **Open the AgentPanel**
4. **See proactive suggestions**
5. **Try the chat/research features**
6. **Watch agents collaborate**

Enjoy your intelligent research assistant! 🚀
