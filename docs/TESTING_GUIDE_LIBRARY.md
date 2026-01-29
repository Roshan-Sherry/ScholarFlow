# Quick Testing Guide - Library Feature

## Setup

1. **Backend**
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. **Frontend**
   ```bash
   npm run dev
   ```

## Test Scenario

### Step 1: Discover Papers
1. Open ScholarFlow in browser
2. Create a new research project OR go to Discovery mode directly
3. In Discovery search box, type: `quantum computing`
4. Press Enter and wait for agent to find papers

**Expected:**
- Agent shows "Searching..." status
- Papers appear as cards with titles, authors, years
- Check browser console - should see: "Adding papers to library: X"
- Each paper logged: "Added paper to library: [title]"

### Step 2: Check Paper Details
1. Look at paper cards
2. Verify each shows:
   - Full title (not truncated badly)
   - Author name (not "Unknown" if data exists)
   - Year (not just "N/A" if data exists)

**Expected:**
- Authors: "Smith et al." or "Unknown Author" if missing
- Year: "2024" or "Year N/A" if missing

### Step 3: Select Papers for Project
1. Click checkboxes on 3-4 papers
2. Notice selection count at bottom
3. Click "Generate Plan" button

**Expected:**
- New project created
- Redirected to project view
- Loading/generating indication

### Step 4: Verify Library Display
1. In new project, look at left sidebar
2. Should see "Library (X)" with paper count
3. Papers listed with checkboxes

**Expected:**
- All selected papers appear
- Titles, authors, years visible
- Some papers may be pre-checked (context selection)

### Step 5: Test Hover Tooltip
1. Hover mouse over a paper in sidebar
2. Keep hovering for 1 second

**Expected:**
- Tooltip appears to the right
- Shows "Paper Summary" header
- Displays abstract/summary text
- "No summary available" if missing

### Step 6: Test Adding to Context
1. Click checkbox next to unchecked paper
2. Notice visual change

**Expected:**
- Paper card gets blue border/background
- Blue indicator line on left edge
- Counter updates: "X Active"

## Edge Cases to Test

### Missing Data
1. Some papers may have incomplete metadata
2. Check that:
   - Missing authors → "Unknown Author"
   - Missing year → "Year N/A"
   - Missing summary → "No summary available" on hover

### Duplicates
1. Search for same topic twice in Discovery
2. Select same papers again
3. Generate new project

**Expected:**
- Papers saved only once to library
- No duplicate entries in database
- Console shows: "Paper X already in library"

### Network Errors
1. Stop backend server
2. Try searching in Discovery

**Expected:**
- Graceful error handling
- Console shows errors but doesn't crash
- Some papers may still be saved if partial success

## Database Verification

### Check Virtual Library
```bash
cd backend
python -c "
from app.models.database import SessionLocal, LibraryItem
db = SessionLocal()
papers = db.query(LibraryItem).filter(LibraryItem.project_id=='discovery-virtual-library').all()
print(f'Papers in virtual library: {len(papers)}')
for p in papers[:5]:
    print(f'  - {p.title} ({p.year})')
db.close()
"
```

### Check Project Libraries
```bash
python -c "
from app.models.database import SessionLocal, Project, LibraryItem
db = SessionLocal()
projects = db.query(Project).all()
for proj in projects:
    if proj.id != 'discovery-virtual-library':
        count = db.query(LibraryItem).filter(LibraryItem.project_id==proj.id).count()
        print(f'{proj.title}: {count} papers')
db.close()
"
```

## Common Issues & Fixes

### "Papers not appearing in library"
- Check backend logs for errors
- Verify database was initialized: `python init_db.py`
- Check VIRTUAL_PROJECT_ID matches in frontend/backend
- Inspect network tab for failed API calls

### "Hover tooltip not showing"
- Check browser console for errors
- Verify summary field exists in paper data
- Try different papers (some may have no summary)
- Check screen size (tooltip hidden on mobile)

### "Unknown showing for all papers"
- Backend data parsing issue
- Check `/papers/search` response in network tab
- Verify authors array is being sent correctly
- Check paper_search.py formatting logic

### "Papers disappear after refresh"
- Papers should persist in database
- Check if fetch_project includes library_items
- Verify React Query cache invalidation working
- Check project ID is correct

## Success Criteria

✅ Papers discovered and displayed  
✅ Papers automatically saved to virtual library  
✅ Papers appear in project library after generation  
✅ Author/year data displays correctly  
✅ Hover tooltip shows summary  
✅ No console errors  
✅ Database contains papers  
✅ Duplicates prevented  
✅ Edge cases handled gracefully  

## Performance Notes

- Library should load instantly (database query)
- Hover tooltip should appear within 1 second
- Paper save happens in background (non-blocking)
- Failed saves don't block UI

## Next Steps After Testing

1. Test with real ArXiv/Semantic Scholar data
2. Verify PDF downloads work
3. Test context selection in RAG queries
4. Test paper deletion (future feature)
5. Test library search/filter (future feature)
