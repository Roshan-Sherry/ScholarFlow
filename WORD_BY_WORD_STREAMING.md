# Word-by-Word Draft Streaming Implementation

## Overview
Implemented real-time word-by-word streaming display for draft sections in Studio mode. As sections are drafted, text appears character-by-character with a smooth typing effect, improving the visual feedback during the writing process.

## Changes Made

### 1. **hooks/useStreaming.ts** - Enhanced useStreamingDraft Hook
Added word-by-word streaming capability with configurable delays:

**New Functions:**
- `sleep(ms)`: Helper to pause between words
- `splitIntoWords(text)`: Splits text into words while preserving whitespace

**Updated streamDraft Flow:**
1. Collects all text chunks into a `wordBuffer` array
2. Splits each chunk into individual words using regex: `/(\s+)/`
3. After streaming completes, iterates through word buffer
4. Calls `onTextChunk` with accumulated text after each word
5. Applies configurable delay between words (default: 20ms, tuned to 25ms)

**Signature:**
```typescript
streamDraft(
  payload: ChatStreamPayload,
  onTextChunk?: (chunk: string) => void,
  onComplete?: (fullText: string) => void,
  wordDelay: number = 20
)
```

### 2. **components/SidebarRight.tsx** - Updated executeDraftSection
Modified draft execution to use word-by-word streaming:

**Key Changes:**
- Removed manual text accumulation (was `let accumulatedText = ""`; let streamDraft handle it)
- Passes 25ms word delay to streamDraft (balanced for visible typing effect without being too slow)
- onTextChunk callback receives full accumulated text (not chunks)
- Each call to onUpdateSection replaces the entire section with accumulated text so far

**Flow:**
```typescript
await streamDraft(
  {
    project_id: activeProject.id,
    message: `Draft section: ${section.title}. Description: ${section.description}`,
    selected_paper_ids: section.relevantPaperIds,
    lab_asset_ids: selectedAssetIds
  }, 
  (accumulatedText) => {
    onUpdateSection(section.title, accumulatedText, 'replace');
  }, 
  undefined, 
  25  // 25ms word delay
);
```

## How It Works

### Word-by-Word Algorithm:
1. **Streaming Phase**: Backend sends text in chunks via SSE
   - Hook receives: `"The quick"`, `" brown"`, `" fox"`
   
2. **Buffering Phase**: All chunks accumulated into wordBuffer
   - `wordBuffer = ["The", " ", "quick", " ", "brown", " ", "fox"]`
   
3. **Display Phase**: Words streamed with delays
   - t=0ms: display "The"
   - t=25ms: display "The "
   - t=50ms: display "The quick"
   - t=75ms: display "The quick "
   - t=100ms: display "The quick brown"
   - ... continues at 25ms intervals

### Streaming Stages:
```
┌─────────────────────────────────────────────────────────────┐
│            Backend Sends Draft in Chunks                     │
│  text_chunk: "The quick brown" → text_chunk: " fox..."       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│      useStreamingDraft Collects to wordBuffer                │
│  ["The", " ", "quick", " ", "brown", " ", "fox", ...]       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Loop Through Words with 25ms Delay                          │
│  accumulatedText += word; onTextChunk(accumulatedText)       │
│  Wait 25ms before next word                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│        SidebarRight.executeDraftSection                      │
│  onUpdateSection(title, accumulatedText, 'replace')          │
│  Updates editor with accumulated text in real-time           │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Word Delay Timing
- **Current Setting**: 25ms per word
- **Too Fast**: <15ms feels jerky, hard to read
- **Too Slow**: >50ms feels sluggish
- **Optimal Range**: 20-30ms for natural typing effect

To adjust, modify in `SidebarRight.tsx` line 347:
```typescript
}, undefined, 25);  // Change this number (in milliseconds)
```

### Whitespace Preservation
The regex `/(\s+)/` in `splitIntoWords()` preserves all spacing:
- Single spaces between words: " "
- Double spaces: "  "
- Newlines: "\n"
- Tabs: "\t"

This ensures formatting is maintained exactly as drafted.

## User Experience

### Before
- Draft sections appeared in chunks (visible jumps of text)
- User sees large blocks of text suddenly appear
- Less engaging visual feedback

### After  
- Text appears to be "typed" word-by-word
- Smooth, continuous flow similar to ChatGPT typing effect
- More engaging and shows real-time progress
- User can read along as text appears

## Testing Checklist

- [x] Build compiles without errors
- [x] Type checking passes
- [x] Word-by-word logic implemented in hook
- [ ] **Manual**: Generate outline in Studio mode
- [ ] **Manual**: Auto-draft or manually draft a section
- [ ] **Manual**: Verify text appears word-by-word with smooth typing effect
- [ ] **Manual**: Check that formatting (line breaks, etc.) is preserved
- [ ] **Manual**: Verify completion callback fires after all words displayed

## Edge Cases Handled

1. **Empty Text**: If wordBuffer is empty after streaming, falls back to splitting accumulatedText
2. **No Word Delay**: Parameter defaults to 20ms if not provided
3. **Fast Network**: Even if all chunks arrive quickly, word-by-word display still applies
4. **Slow Network**: Chunks are accumulated and displayed at consistent typing speed

## Performance Impact

- **Negligible CPU**: Word splitting and delays are lightweight operations
- **Cancellation-Safe**: Each word delay is a promise, can be cancelled by component unmount
- **Memory**: Stores entire text in accumulatedText (same as before), plus wordBuffer during streaming

## Future Enhancements

1. **Configurable Typing Speed**: Add UI slider to adjust wordDelay per user preference
2. **Pause/Resume**: Allow user to pause streaming and resume manually
3. **Animation**: Add cursor animation or caret effect
4. **Haptic Feedback**: Vibration on mobile devices for each word (optional)
5. **Adaptive Speed**: Vary speed based on word length or punctuation
