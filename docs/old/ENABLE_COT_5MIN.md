# ⚡ Enable CoT Model - 5 Minute Setup

## 📋 Checklist (Copy/Paste Instructions)

### Step 1: Open PowerShell (1 min)

Open Windows PowerShell and go to the models folder:

```powershell
cd C:\Users\fudha\Desktop\scholarflow\backend
```

### Step 2: Create the Model (2 min)

Run this command:

```powershell
ollama create scholarmate-cot -f models/ScholarMate-CoT.Modelfile
```

**Wait for it to finish.** You should see:
```
✓ Created model: scholarmate-cot
```

If Ollama error: Make sure `ollama serve` is running in another terminal

### Step 3: Update Configuration (1 min)

Edit `backend/app/core/config.py`:

**Find line ~34:**
```python
ollama_model_smart: str = "scholarmate"
```

**Change to:**
```python
ollama_model_smart: str = "scholarmate-cot"
```

**Save file (Ctrl+S)**

### Step 4: Restart Backend (1 min)

In your backend terminal:

1. Stop it (Ctrl+C)
2. Start it again:
```powershell
python -m uvicorn app.main:app --reload --port 8000
```

### Step 5: Test It ✅

Open browser, ask a research question in ScholarFlow. It should work the same but with better reasoning.

---

## 🎯 That's It!

You now have:
- ✅ CoT model installed
- ✅ Backend using it
- ✅ Better reasoning system
- ✅ Everything ready to go

---

## 📖 What Happened?

| Before | After |
|--------|-------|
| `scholarmate` model | `scholarmate-cot` model |
| Standard reasoning | Enhanced reasoning |
| Can't see thinking | Thinking available (hidden) |
| Same response time | Slight slowdown (±100ms) |

---

## 🔄 Switch Back (If Needed)

To go back to standard model:

1. Edit `backend/app/core/config.py`
2. Change: `ollama_model_smart: str = "scholarmate-cot"`
3. To: `ollama_model_smart: str = "scholarmate"`
4. Restart backend

---

## 💡 Optional: Show Thinking to User

To see the model's reasoning in the UI:

**Edit `backend/app/core/config.py` line ~43:**

```python
show_thinking_to_user: bool = False
```

Change to:

```python
show_thinking_to_user: bool = True
```

Then restart backend. Next research query will show thinking process.

---

## ❓ Issues?

**Model not found:**
```powershell
ollama list
# Should show: scholarmate-cot
```

**Still slow/not working:**
1. Did you restart backend? (Ctrl+C then start again)
2. Is Ollama running? (Check `ollama serve` in another terminal)
3. Check spelling in config.py

**Need help?**
- See: [ENABLE_COT_QUICK_START.md](../ENABLE_COT_QUICK_START.md)
- Or: [COT_CONFIGURATION.md](./COT_CONFIGURATION.md)
- Or: [backend/docs/CHAIN_OF_THOUGHT_GUIDE.md](../backend/docs/CHAIN_OF_THOUGHT_GUIDE.md)

---

**Done!** Your system now has advanced Chain-of-Thought reasoning. 🚀
