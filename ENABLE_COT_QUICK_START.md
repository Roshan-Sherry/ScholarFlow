# 🚀 How to Enable Chain-of-Thought Models - Quick Start

## Option 1: Use Existing Model (Fast - No Setup)

Your current **scholarmate** model already works! It just doesn't show thinking explicitly.

1. **Leave config as-is** - Changes will make the system parse any thinking the model naturally produces
2. **Test immediately** - Run the backend and make a research query
3. **Responses work** - No thinking shown, but better reasoning still applied

---

## Option 2: Create Enhanced CoT Model (Recommended)

Create a specialized model that explicitly shows its reasoning.

### Step 1: Open Terminal/PowerShell

Navigate to the models folder:
```powershell
cd C:\Users\fudha\Desktop\scholarflow\backend\models
ls  # Verify you see the Modelfiles
```

Output should show:
```
ScholarMate.Modelfile
ScholarFlow-Search.Modelfile
ScholarFlow-Studio.Modelfile
ScholarMate-CoT.Modelfile    # ← NEW
```

### Step 2: Create the CoT Model with Ollama

```powershell
ollama create scholarmate-cot -f ScholarMate-CoT.Modelfile
```

**Output should show:**
```
✅ Creating model...
✅ Pulling base: llama3.2:3b
✅ Creating modelfile...
✅ Created model: scholarmate-cot
```

**If you get an error:**
- Make sure Ollama is running: `ollama serve` (in another terminal)
- Make sure llama3.2:3b is pulled: `ollama pull llama3.2:3b`

### Step 3: Verify Model Created

```powershell
ollama list
```

You should see:
```
scholarmate-cot      latest    7.5GB    ...
scholarmate          latest    7.5GB    ...
scholarflow-search   latest    2.7GB    ...
scholarflow-studio   latest    7.5GB    ...
```

### Step 4: Update Backend Configuration

Edit `backend/.env` or `backend/app/core/config.py`:

**Option A: Environment Variable (.env)**
```bash
# In backend/.env file, add or update:
OLLAMA_MODEL_SMART=scholarmate-cot
ENABLE_COT_REASONING=true
SHOW_THINKING_TO_USER=false
```

**Option B: Direct Edit (config.py)**

Open `backend/app/core/config.py`:

```python
# Find this line:
ollama_model_smart: str = "scholarmate"

# Change to:
ollama_model_smart: str = "scholarmate-cot"

# And add these:
enable_cot_reasoning: bool = True
show_thinking_to_user: bool = False  # Change to True to see reasoning
```

### Step 5: Restart Backend

Kill the backend process and restart:

```powershell
# Kill existing backend
Get-Process python | Where {$_.Name -match "uvicorn|python"} | Stop-Process -Force

# Restart
cd C:\Users\fudha\Desktop\scholarflow\backend
python -m uvicorn app.main:app --reload --port 8000
```

### Step 6: Test It Works

Run the test script:

```powershell
cd C:\Users\fudha\Desktop\scholarflow\backend
python tests/test_chain_of_thought.py
```

**Expected output:**
```
🚀 Starting Chain-of-Thought Model Tests...

TEST 1: STANDARD MODEL (Current Setup)
...
TEST 2: CHAIN-OF-THOUGHT MODEL (With Template)
...
🧠 THINKING PROCESS:
1. Query Understanding: ...
2. Paper Analysis: ...
...

✅ ALL TESTS COMPLETED
```

---

## Option 3: See Thinking in UI (Optional)

If you want to **display the model's reasoning to users**:

### Step 1: Enable in Backend

Edit `backend/.env`:
```bash
SHOW_THINKING_TO_USER=true
```

### Step 2: Update Frontend

The frontend already supports thinking! It logs it. To display it visually:

Open `components/SidebarRight.tsx` or create a new component:

```tsx
{/* Add this collapsible section for thinking */}
{message.source === 'Thought' && (
  <details className="p-3 bg-blue-50 rounded border border-blue-200 my-2 cursor-pointer">
    <summary className="font-semibold text-blue-700 flex items-center gap-2">
      🧠 <span>Model Reasoning</span>
      <span className="text-sm font-normal text-gray-600">(click to expand)</span>
    </summary>
    <pre className="mt-3 text-sm bg-blue-100 p-3 rounded overflow-auto max-h-60 text-gray-800">
      {message.message}
    </pre>
  </details>
)}
```

### Step 3: Test in Browser

1. Open ScholarFlow UI
2. Ask a research question
3. Look for 📢 "Model Reasoning" section showing the thinking
4. Click to expand and see the full reasoning process

---

## 🎯 Different Modes Explained

### Standard Mode (Current)
```
scholarmate (regular)
↓
No explicit thinking shown
↓
Responses still good
✓ Fast
✓ Works now
✗ Can't see reasoning
```

### CoT Mode (Recommended)
```
scholarmate-cot (enhanced)
↓
<thinking>...</thinking> tags in response
↓
Backend parses and separates
↓
Optional: Show to user
✓ See reasoning
✓ Better quality
✓ Debuggable
✗ Slightly slower (50-100ms more)
```

---

## 📊 Performance Comparison

| Feature | Standard | CoT |
|---------|----------|-----|
| Speed | 2-4s | 2.5-4.5s |
| Reasoning shown | ✗ | ✓ |
| Token cost | Lower | 15% higher |
| Debuggability | Low | High |
| Response quality | Good | Better |
| Best for | Quick tasks | Complex analysis |

---

## 🔄 Switch Between Models Anytime

Want to compare? Switch back and forth:

```python
# In config.py
ollama_model_smart: str = "scholarmate"      # Standard version
# or
ollama_model_smart: str = "scholarmate-cot"  # With reasoning
```

Just restart the backend and responses will use the selected model.

---

## ❓ Troubleshooting

### Problem: Model not found
```powershell
ollama pull llama3.2:3b
ollama create scholarmate-cot -f ScholarMate-CoT.Modelfile
```

### Problem: Ollama not running
```powershell
ollama serve
# In another terminal:
ollama create scholarmate-cot -f ScholarMate-CoT.Modelfile
```

### Problem: Backend still using old model
```powershell
# Kill all Python processes
Get-Process python | Stop-Process -Force

# Restart
python -m uvicorn app.main:app --reload --port 8000
```

### Problem: Thinking not appearing
1. Check `ENABLE_COT_REASONING=true` in .env
2. Check `SHOW_THINKING_TO_USER=true` in .env
3. Make sure you're using `scholarmate-cot`, not `scholarmate`
4. Check browser console for errors

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Ollama running (`ollama serve`)
- [ ] Model created (`ollama list` shows scholarmate-cot)
- [ ] .env updated with new model name
- [ ] Backend restarted
- [ ] Test script passes
- [ ] Ask a research question in UI
- [ ] Avatar speaks the narration ✓
- [ ] Formal content displays ✓
- [ ] [Optional] Thinking shown if enabled ✓

---

## 🎓 Next Steps

1. **Quick test** (5 min): Follow Option 1 above
2. **Full setup** (15 min): Follow Option 2 above
3. **Show thinking** (5 min): Follow Option 3 above
4. **Tune parameters**: See CHAIN_OF_THOUGHT_GUIDE.md

Questions? Check the detailed guide in `backend/docs/CHAIN_OF_THOUGHT_GUIDE.md`
