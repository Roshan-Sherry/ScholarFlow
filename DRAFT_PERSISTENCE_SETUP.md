# Draft Persistence Setup Guide

## Overview
Draft persistence has been added to save paper outlines and content automatically. The database schema has been updated and needs to be migrated.

## Required Steps

### 1. Run Database Migration (First Time Only)

If you're using **Alembic** (SQLAlchemy):
```bash
cd backend
alembic upgrade head
```

This will:
- Add `full_content` column to store paper text
- Add `outline` column to store manuscript structure

### 2. Verify Database Setup

Check that your database URL is configured in `backend/app/core/config.py` or `.env`:
```
DATABASE_URL=sqlite:///./app.db
# or
DATABASE_URL=postgresql://user:password@localhost/scholarflow
```

### 3. Backend Is Ready

The following endpoints are now available:
- `POST /research/draft/save` - Save outline and/or content
- `GET /research/draft/load/{project_id}` - Load saved draft

### 4. Frontend Auto-Save

The frontend now:
- **Loads** saved draft content when opening a project
- **Auto-saves** paper content every 3 seconds of inactivity
- **Auto-saves** outline every 2 seconds of inactivity

## API Endpoint Details

### Save Draft
```http
POST /api/v1/research/draft/save
Content-Type: application/json

{
  "project_id": "uuid",
  "outline": [
    {
      "id": "section-1",
      "title": "Introduction",
      "description": "...",
      "status": "pending|drafting|completed",
      "relevantPaperIds": ["paper-1", "paper-2"]
    }
  ],
  "content": "# My Paper\n\nFull paper text here..."
}
```

**Response:**
```json
{
  "id": "draft-uuid",
  "project_id": "project-uuid",
  "outline": [...],
  "full_content": "...",
  "word_count": 1250,
  "created_at": "2026-02-16T10:00:00",
  "updated_at": "2026-02-16T10:00:00"
}
```

### Load Draft
```http
GET /api/v1/research/draft/load/{project_id}
```

**Response:**
```json
{
  "id": "draft-uuid",
  "project_id": "project-uuid",
  "outline": [...],
  "full_content": "...",
  "word_count": 1250,
  "created_at": "2026-02-16T10:00:00",
  "updated_at": "2026-02-16T10:00:00"
}
```

If no draft exists, returns empty draft with null values.

## Troubleshooting

### 500 Error Loading Draft

**Cause:** Migration hasn't been run yet
**Fix:** Run `alembic upgrade head` in the backend directory

### "Column full_content not found"

**Cause:** Database schema is out of date
**Fix:** Run migrations with `alembic upgrade head`

### Auto-save not working

**Check:**
1. Backend is running at correct URL (default: `http://localhost:8000`)
2. `VITE_API_URL` environment variable is set (for production)
3. Check browser console for errors
4. Check `/logs` endpoint for backend errors

## Files Changed

- **Database Schema**: `backend/app/models/database.py` - Added `full_content` and `outline` to Draft model
- **Migration**: `backend/alembic/versions/002_add_draft_persistence.py` - Schema migration
- **API**: `backend/app/api/research.py` - Added save/load endpoints
- **Frontend**: `components/WorkspaceStudio.tsx` - Auto-load and auto-save logic
- **Schemas**: `backend/app/models/schemas.py` - Added SaveDraftRequest and DraftResponse

## Next Steps

1. Run the migration: `alembic upgrade head`
2. Restart backend server
3. Test by opening a project in Studio mode
4. Create an outline and draft sections
5. Close and reopen browser - content should be restored
