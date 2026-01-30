# Integration Fix & Enhancement Plan
**Date**: January 28, 2026  
**Based on**: Deep Integration Analysis

---

## Overview

This plan addresses the gaps identified in the integration analysis, prioritized by impact and implementation complexity.

---

## Phase 1: Critical Fixes (Week 1)

### 1.1 Fix Discovery Results Display 🔴 CRITICAL

**Problem**: Papers found by backend never reach frontend for selection

**Backend Changes** (`backend/app/api/chat.py`):
```python
@router.post("/stream")
async def stream_workflow(request: ChatRequest, db: Session = Depends(get_db)):
    async def event_generator():
        # ... existing code ...
        
        async for chunk in research_graph.astream(initial_state):
            for node_name, state_update in chunk.items():
                # ... existing log streaming ...
                
                # NEW: Send found papers event
                if state_update.get("found_papers"):
                    papers_list = state_update["found_papers"]
                    
                    # Format papers for frontend
                    formatted_papers = []
                    for paper in papers_list[:20]:  # Limit to 20 for UI
                        formatted_papers.append({
                            "id": paper.get("id") or f"paper-{hash(paper.get('title', ''))}",
                            "title": paper.get("title", ""),
                            "authors": paper.get("authors", []),
                            "year": paper.get("year"),
                            "summary": paper.get("abstract") or paper.get("summary", ""),
                            "pdfUrl": paper.get("pdf_url") or paper.get("url"),
                            "tags": [],
                            "source": paper.get("source", "unknown")
                        })
                    
                    # Emit found event
                    found_event = {
                        "type": "found",
                        "count": len(formatted_papers),
                        "papers": formatted_papers
                    }
                    yield f"data: {json.dumps(found_event)}\n\n"
                    logger.info(f"Sent 'found' event with {len(formatted_papers)} papers")
                
                # ... rest of existing code ...
```

**Frontend Changes** (`components/WorkspaceDiscovery.tsx`):
```tsx
// Update streamChat callback to handle 'found' event
await streamChat({
    project_id: VIRTUAL_PROJECT_ID,
    message: userQuery,
    selected_paper_ids: Array.from(selectedContextIds),
    lab_asset_ids: []
}, (chunk) => {
    // Handle text chunks (if any)
    accumulatedAnswer += chunk;
    updateTurn(agentTurnId, {
        status: 'synthesizing',
        answer: accumulatedAnswer
    });
});

// Update useStreaming hook to handle 'found' event
// In hooks/useStreaming.ts
export function useStreamingChat() {
    // ... existing code ...
    
    const streamChat = useCallback(async (
        payload: ChatStreamPayload,
        onTextChunk?: (text: string) => void,
        onComplete?: (fullText: string) => void,
        onPapersFound?: (papers: Paper[]) => void  // NEW CALLBACK
    ) => {
        // ... existing setup ...
        
        for await (const event of streamChatWorkflow(payload)) {
            // ... existing handlers ...
            
            // NEW: Handle 'found' event
            if (event.type === 'found' && event.papers) {
                if (onPapersFound) {
                    onPapersFound(event.papers);
                }
                addAgentLog('System', `Found ${event.count} relevant papers`, 'success');
            }
            
            // ... rest of existing code ...
        }
    }, []);
    
    return { streamChat, isStreaming, error };
}
```

**Update WorkspaceDiscovery to use new callback**:
```tsx
const handleSearch = async (e: React.FormEvent) => {
    // ... existing setup ...
    
    try {
        let accumulatedAnswer = "";
        
        await streamChat({
            project_id: VIRTUAL_PROJECT_ID,
            message: userQuery,
            selected_paper_ids: Array.from(selectedContextIds),
            lab_asset_ids: []
        }, 
        (chunk) => {
            // Text chunks
            accumulatedAnswer += chunk;
            updateTurn(agentTurnId, {
                status: 'synthesizing',
                answer: accumulatedAnswer
            });
        }, 
        (fullText) => {
            // Complete
            updateTurn(agentTurnId, {
                status: 'completed',
                answer: fullText
            });
        },
        (papers) => {
            // NEW: Papers found callback
            updateTurn(agentTurnId, {
                sources: papers
            });
            
            // Add to known papers map
            const updatedMap = new Map(knownPapers);
            papers.forEach(p => updatedMap.set(p.id, p));
            setKnownPapers(updatedMap);
        });
    } catch (error) {
        console.error("Search failed", error);
    }
};
```

**Testing**:
```bash
# Backend test
pytest tests/test_chat_streaming.py::test_found_event

# Frontend test
npm run dev
# 1. Enter Discovery mode
# 2. Search for "quantum computing"
# 3. Verify papers appear in results
# 4. Verify checkboxes work for selection
```

**Time Estimate**: 4-6 hours

---

### 1.2 Remove Page Reload in Project Generation 🔴 CRITICAL

**Problem**: `window.location.reload()` causes poor UX

**Fix** (`App.tsx`):
```tsx
const handleCreateProjectFromDiscovery = async (selectedPapers: Paper[]) => {
    addAgentLog('System', `Generating Research Plan from ${selectedPapers.length} papers...`);

    try {
        const paperIds = selectedPapers.map(p => p.id);
        const newProject = await api.generateProject(paperIds);

        addAgentLog('System', 'Research Plan generated successfully.', 'success');

        // Use React Query to refresh projects list
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        
        // Navigate to the new project
        handleOpenProject(newProject.id);
        
        // ❌ REMOVE THIS LINE
        // window.location.reload();
        
    } catch (error) {
        console.error(error);
        addAgentLog('System', `Failed to generate plan: ${error}`, 'error');
    }
};
```

**Add queryClient to App.tsx**:
```tsx
import { useQueryClient } from '@tanstack/react-query';

export default function App() {
    const queryClient = useQueryClient();
    // ... rest of component
}
```

**Testing**:
- Generate project from Discovery
- Verify smooth navigation without full page refresh
- Verify new project appears in Dashboard immediately

**Time Estimate**: 1 hour

---

### 1.3 Add Authentication Framework 🔴 CRITICAL

**Backend** (`backend/app/core/auth.py` - NEW FILE):
```python
"""Authentication and authorization"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel

# Configuration
SECRET_KEY = "your-secret-key-here"  # Move to .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    # TODO: Fetch user from database
    return {"username": username}
```

**Add login endpoint** (`backend/app/api/auth.py` - NEW FILE):
```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from app.core.auth import verify_password, create_access_token, Token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # TODO: Fetch user from database
    # For now, hardcoded demo user
    if form_data.username != "demo" or form_data.password != "demo123":
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": form_data.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register")
async def register(username: str, password: str):
    # TODO: Implement user registration
    pass
```

**Protect endpoints** (example):
```python
from app.core.auth import get_current_user

@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    current_user = Depends(get_current_user),  # NEW
    db: Session = Depends(get_db)
):
    # ... existing code ...
```

**Frontend** (`lib/auth.ts` - NEW FILE):
```typescript
const AUTH_TOKEN_KEY = 'scholarflow_token';

export const authService = {
    async login(username: string, password: string) {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        const response = await fetch(`${API_URL}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
        });
        
        if (!response.ok) throw new Error('Login failed');
        
        const data = await response.json();
        localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
        return data;
    },
    
    logout() {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    },
    
    getToken() {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    },
    
    isAuthenticated() {
        return !!this.getToken();
    }
};

// Update axios interceptor in api-client.ts
apiClient.interceptors.request.use((config) => {
    const token = authService.getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
```

**Note**: This is a basic implementation. For production:
- Move to proper user database
- Add refresh tokens
- Implement proper password requirements
- Add rate limiting
- Add email verification

**Time Estimate**: 8-12 hours for basic implementation

---

## Phase 2: High Priority UX (Week 2)

### 2.1 Voice Feature Integration 🟡 HIGH

**Frontend Components** (`components/VoiceInput.tsx` - NEW FILE):
```tsx
import React, { useState, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import * as api from '../lib/api-client';

interface VoiceInputProps {
    onTranscript: (text: string) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                setIsProcessing(true);
                
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'recording.webm');
                
                try {
                    const response = await fetch(`${import.meta.env.VITE_API_URL}/voice/transcribe`, {
                        method: 'POST',
                        body: formData,
                    });
                    
                    const data = await response.json();
                    onTranscript(data.text);
                } catch (error) {
                    console.error('Transcription failed', error);
                } finally {
                    setIsProcessing(false);
                }
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Microphone access denied', error);
        }
    };
    
    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };
    
    return (
        <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`p-2 rounded-full transition-all ${
                isRecording 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isRecording ? 'Stop recording' : 'Start voice input'}
        >
            {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRecording ? (
                <MicOff className="w-5 h-5" />
            ) : (
                <Mic className="w-5 h-5" />
            )}
        </button>
    );
};
```

**Add to chat inputs**:
```tsx
// In WorkspaceDiscovery.tsx and SidebarRight.tsx
import { VoiceInput } from './VoiceInput';

// In the input area
<div className="flex gap-2">
    <VoiceInput onTranscript={(text) => setQuery(text)} />
    <input ... />
    <button ...>Send</button>
</div>
```

**Testing**:
- Request microphone permission
- Record 5-second voice message
- Verify transcription appears in input
- Test with different accents/speeds

**Time Estimate**: 6-8 hours

---

### 2.2 File Persistence Backend 🟡 HIGH

**Database Migration** (`backend/alembic/versions/002_add_project_files.py`):
```python
"""Add project files table

Revision ID: 002
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

def upgrade():
    op.create_table(
        'project_files',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('type', sa.String, nullable=False),  # 'file' or 'folder'
        sa.Column('content', sa.Text, default=''),
        sa.Column('parent_id', UUID(as_uuid=True), sa.ForeignKey('project_files.id', ondelete='CASCADE'), nullable=True),
        sa.Column('extension', sa.String, nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_project_files_project_id', 'project_files', ['project_id'])

def downgrade():
    op.drop_table('project_files')
```

**API Endpoints** (`backend/app/api/files.py` - NEW FILE):
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.models.database import get_db, ProjectFile
from app.core.auth import get_current_user

router = APIRouter(prefix="/files", tags=["files"])


class FileCreate(BaseModel):
    name: str
    type: str  # 'file' or 'folder'
    project_id: str
    parent_id: str | None = None
    content: str = ''
    extension: str | None = None


class FileUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


@router.post("", response_model=dict)
async def create_file(
    file: FileCreate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_file = ProjectFile(**file.dict())
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file


@router.get("/project/{project_id}", response_model=List[dict])
async def get_project_files(
    project_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    files = db.query(ProjectFile).filter(ProjectFile.project_id == project_id).all()
    return files


@router.patch("/{file_id}")
async def update_file(
    file_id: str,
    updates: FileUpdate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_file = db.query(ProjectFile).filter(ProjectFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(db_file, key, value)
    
    db.commit()
    return {"message": "File updated"}


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_file = db.query(ProjectFile).filter(ProjectFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    db.delete(db_file)
    db.commit()
    return {"message": "File deleted"}
```

**Frontend Integration** (`lib/api-client.ts`):
```typescript
export const createFile = async (file: {
    name: string;
    type: 'file' | 'folder';
    project_id: string;
    parent_id?: string;
    content?: string;
    extension?: string;
}): Promise<ProjectFile> => {
    const { data } = await apiClient.post('/files', file);
    return data;
};

export const getProjectFiles = async (projectId: string): Promise<ProjectFile[]> => {
    const { data } = await apiClient.get(`/files/project/${projectId}`);
    return data;
};

export const updateFile = async (fileId: string, updates: {
    name?: string;
    content?: string;
}): Promise<void> => {
    await apiClient.patch(`/files/${fileId}`, updates);
};

export const deleteFile = async (fileId: string): Promise<void> => {
    await apiClient.delete(`/files/${fileId}`);
};
```

**Update projectStore** (`stores/projectStore.ts`):
```tsx
// Add API calls to file operations
const addFile = async (file: ProjectFile) => {
    const newFile = await api.createFile({
        name: file.name,
        type: file.type,
        project_id: get().activeProject!.id,
        parent_id: file.parentId,
        content: file.content,
        extension: file.extension
    });
    
    set(state => ({
        activeProject: {
            ...state.activeProject!,
            files: [...state.activeProject!.files, newFile]
        }
    }));
};
```

**Time Estimate**: 10-12 hours

---

### 2.3 Outline Editing UI 🟡 HIGH

**Frontend** (`components/OutlineEditor.tsx` - NEW FILE):
```tsx
import React, { useState } from 'react';
import { Plus, Edit2, Trash2, GripVertical, Check, X } from 'lucide-react';
import { OutlineSection } from '../types';

interface OutlineEditorProps {
    outline: OutlineSection[];
    onUpdate: (outline: OutlineSection[]) => void;
}

export const OutlineEditor: React.FC<OutlineEditorProps> = ({ outline, onUpdate }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    
    const handleAdd = () => {
        const newSection: OutlineSection = {
            id: `section-${Date.now()}`,
            title: 'New Section',
            description: '',
            status: 'pending',
            relevantPaperIds: [],
            recommendedAssetTypes: []
        };
        onUpdate([...outline, newSection]);
        setEditingId(newSection.id);
        setEditTitle(newSection.title);
        setEditDescription(newSection.description);
    };
    
    const handleEdit = (section: OutlineSection) => {
        setEditingId(section.id);
        setEditTitle(section.title);
        setEditDescription(section.description);
    };
    
    const handleSave = () => {
        const updated = outline.map(s => 
            s.id === editingId 
                ? { ...s, title: editTitle, description: editDescription }
                : s
        );
        onUpdate(updated);
        setEditingId(null);
    };
    
    const handleDelete = (id: string) => {
        if (confirm('Delete this section?')) {
            onUpdate(outline.filter(s => s.id !== id));
        }
    };
    
    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newOutline = [...outline];
        [newOutline[index - 1], newOutline[index]] = [newOutline[index], newOutline[index - 1]];
        onUpdate(newOutline);
    };
    
    const handleMoveDown = (index: number) => {
        if (index === outline.length - 1) return;
        const newOutline = [...outline];
        [newOutline[index], newOutline[index + 1]] = [newOutline[index + 1], newOutline[index]];
        onUpdate(newOutline);
    };
    
    return (
        <div className="space-y-2">
            {outline.map((section, index) => (
                <div key={section.id} className="border rounded-lg p-3 bg-white">
                    {editingId === section.id ? (
                        <div className="space-y-2">
                            <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full font-medium border-b pb-1"
                            />
                            <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full text-sm text-gray-600 resize-none"
                                rows={2}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleSave} className="text-green-600">
                                    <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingId(null)} className="text-red-600">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2">
                            <div className="flex flex-col gap-1">
                                <button onClick={() => handleMoveUp(index)} className="text-gray-400 hover:text-gray-600">
                                    <GripVertical className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex-1">
                                <div className="font-medium">{section.title}</div>
                                <div className="text-sm text-gray-600">{section.description}</div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(section)} className="text-blue-600">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(section.id)} className="text-red-600">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
            <button
                onClick={handleAdd}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" /> Add Section
            </button>
        </div>
    );
};
```

**Integrate into SidebarRight**:
```tsx
// Add toggle for edit mode
const [isEditingOutline, setIsEditingOutline] = useState(false);

// In Plan tab
{isEditingOutline ? (
    <OutlineEditor outline={outline} onUpdate={setOutline} />
) : (
    // ... existing read-only outline display
)}

<button onClick={() => setIsEditingOutline(!isEditingOutline)}>
    {isEditingOutline ? 'Done Editing' : 'Edit Outline'}
</button>
```

**Time Estimate**: 6-8 hours

---

## Phase 3: Polish & Optimization (Week 3)

### 3.1 Progress Feedback
- PDF upload progress bar
- Background processing indicators
- Long operation spinners

**Time Estimate**: 4 hours

---

### 3.2 Optimistic Updates
- Immediate UI updates for mutations
- Rollback on failure
- Better perceived performance

**Time Estimate**: 6 hours

---

### 3.3 Comparison Table Endpoint
- Dedicated `/compare` endpoint
- Structured comparison analysis
- Better than prompt-based

**Time Estimate**: 8 hours

---

## Phase 4: Advanced Features (Week 4+)

### 4.1 WebSocket Support
- Real-time collaboration
- Live cursor positions
- Shared editing

**Time Estimate**: 16+ hours

---

### 4.2 Offline Support
- Service worker
- Cache strategies
- Sync queue

**Time Estimate**: 20+ hours

---

## Testing Strategy

### Unit Tests
- [ ] Backend: Test new endpoints
- [ ] Frontend: Test new components
- [ ] Integration: Test full workflows

### E2E Tests (Playwright)
```typescript
test('Discovery workflow', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Literature Review');
    await page.fill('[placeholder="Search"]', 'quantum computing');
    await page.click('button:has-text("Search")');
    
    // Wait for results
    await page.waitForSelector('.paper-result');
    
    // Select papers
    await page.click('.paper-result:first-child input[type="checkbox"]');
    
    // Generate project
    await page.click('button:has-text("Generate Plan")');
    
    // Verify navigation
    await expect(page).toHaveURL(/\/project\//);
});
```

---

## Deployment Checklist

Before production:
- [ ] Enable authentication on all endpoints
- [ ] Set up HTTPS
- [ ] Configure CORS for production domain
- [ ] Set up database backups
- [ ] Add rate limiting
- [ ] Set up error monitoring (Sentry)
- [ ] Configure logging
- [ ] Set up CI/CD pipeline
- [ ] Load testing
- [ ] Security audit

---

## Time Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | Critical Fixes | 13-19 hours |
| Phase 2 | High Priority | 22-28 hours |
| Phase 3 | Polish | 18 hours |
| Phase 4 | Advanced | 36+ hours |
| **Total** | | **89-101+ hours** |

**Recommended Approach**: Focus on Phase 1 first (Week 1), then Phase 2 (Week 2), then evaluate priorities based on user feedback.

---

## Success Metrics

### Phase 1 Success
- ✅ Users can see and select discovered papers
- ✅ No page reloads during navigation
- ✅ Basic authentication working

### Phase 2 Success
- ✅ Voice input functional
- ✅ Files persist across sessions
- ✅ Outline editing works

### Phase 3 Success
- ✅ All operations feel instant
- ✅ No UI blocking during long operations

### Overall Success
- ✅ All critical features have backend implementation
- ✅ User can complete full workflows without bugs
- ✅ System ready for beta testing

---

## Next Actions

1. ✅ Review this plan with team
2. Set up task tracking (GitHub Issues / Jira)
3. Create feature branches
4. Start with Phase 1, Task 1.1 (Discovery Results)
5. Daily standups to track progress
6. Weekly demos to stakeholders

---

**Created by**: AI Assistant  
**Date**: January 28, 2026  
**Status**: Ready for Implementation
