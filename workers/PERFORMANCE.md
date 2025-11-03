# Performance Testing Notes

This document tracks performance observations and testing procedures for the GameGame chat agent.

## Current Performance

**Agent**: OpenAI Agents SDK with gpt-5 model

**Test Query**: "How do the docks work?" (speakeasy-2025)

### After Optimization (2025-11-02 - Latest)

**Changes Applied**:
1. Reduced search result limit from 10 → 5 fragments per call (`src/lib/ai/search.ts:269`)
2. Added search strategy guidance to prompt (`src/lib/ai/prompt.ts:190-195`)

**Results**:
- **Total time: 106.5 seconds (1 minute 47 seconds)** ✅ **47.5% faster**
- Tool calls: 5 `search_resources` calls (increased from 4, but still faster overall)
- **Prompt tokens: 58,610** (down from 69,849 - **16% reduction**)
- Completion tokens: 7,536
- Reasoning tokens: 5,184
- **Total: 66,146 tokens** (down from 79,370 - **17% reduction**)

**Analysis**:
- Saved **96 seconds** despite one additional tool call
- Fragment count reduction (5 vs 10 per search) had massive impact on LLM reasoning time
- Smaller context windows = faster inference, even with more searches
- Prompt guidance didn't fully prevent multiple searches (still 5 calls instead of target 1-2)

**Key Insight**: Reducing fragments per search is MORE effective than reducing search count.

### Baseline (Before Optimization)

**Measured Performance** (2025-11-02):
- **Total time: 202.9 seconds (3 minutes 23 seconds)** ❌
- Tool calls: 4 `search_resources` calls
- Tool execution time: ~1.8s total (551ms + 380ms + 410ms + 476ms)
- **LLM reasoning time: 201+ seconds** (the real bottleneck!)

**Token Usage**:
- Prompt tokens: **69,849** (!!!)
- Completion tokens: 9,521
- Reasoning tokens: 7,296
- **Total: 79,370 tokens**

**Timing Breakdown**:
1. Tool call 1: 551ms → LLM reasoning
2. Tool call 2: 380ms → LLM reasoning
3. Tool call 3: 410ms → LLM reasoning
4. Tool call 4: 476ms → LLM reasoning → **199 seconds for final response**

**Root Cause**:
- Each `search_resources` call returns 10 fragments
- 4 calls = 40 fragments in context
- Each LLM call processes **69k+ tokens**
- 4 sequential LLM inferences with massive prompts = 3+ minutes

**Key Insight**: The agent is doing TOO MANY tool calls, each with a HUGE context window.

## Testing Setup

### Test Commands
```bash
# Basic usage - shows tool progress and answer
pnpm cli ask speakeasy-2025 "How do the docks work?"

# Verbose mode - shows detailed debugging info
pnpm cli ask speakeasy-2025 "How do the docks work?" --verbose
```

### Prerequisites
- Server must be running: `pnpm dev`
- Database must contain game with processed rulebook
- **IMPORTANT**: DO NOT reset database or delete data during performance testing

### Viewing Server Logs
Server logs are in the background `pnpm dev` process.
- Check logs via Claude Code: Use `BashOutput` tool on the background dev server process
- Or view directly in the terminal where you ran `pnpm dev`

## CLI Output Modes

**Default mode:**
- Tool progress indicators (🔧/✓)
- Answer with markdown formatting
- Sources with citations
- Follow-up questions

**Verbose mode (`--verbose`):**
- Event-by-event SSE stream logs
- HTTP request/response timing breakdown
- Performance metrics (duration, tokens, tool calls)
- Per-step LLM execution breakdown
- Tool call durations

## Known Performance Factors

1. **Tool Calls**: Each tool call adds latency (~500ms search time + LLM reasoning)
2. **Vector Search**: Hybrid search with full-text + semantic search
3. **LLM Inference**: GPT-5 model response time
4. **Fragment Count**: Number of text chunks returned (default: 10)
5. **Context Size**: Total prompt tokens from retrieved fragments

## Optimizations Applied

**Completed (2025-11-02)**:
- [x] **Reduce fragments per search call** (10 → 5) - `src/lib/ai/search.ts:269` ✅ **47.5% faster**
- [x] **Improve search strategy in prompt** - `src/lib/ai/prompt.ts:190-196` ✅ **Critical - reduced to 1 search**
  - Changed from "use broad queries" → "use targeted searches matching user intent"
  - Added example: "How do the docks work?" → "docks mechanics how docks work placement ambush attack"
- [x] **Add low reasoning effort** - `src/routes/api/chat-handler.ts:127-129` ✅ **Reduces overhead**
  - Added `modelConfig: { reasoning_effort: 'low' }` to Agent config

## Re-indexing Complete ✅

**Changes Applied and Tested** (2025-11-02):
- [x] **Increased chunk size** from 1000 → 2500 characters (`src/lib/services/chunking.ts:10`)
- [x] **Increased chunk overlap** from 100 → 200 characters (`src/lib/services/chunking.ts:11`)
- [x] **Increased "keep whole" threshold** from 1500 → 3000 characters (`src/lib/services/chunking.ts:73, 95`)
- [x] **Incremented index version** from 3 → 4 (`src/lib/ai/embeddings.ts:4`)
- [x] **Re-indexed all resources** with new chunking settings

**Results After Re-indexing + Prompt Improvements + Low Reasoning**:
- **Total time: 78.6 seconds (1 minute 19 seconds)** ✅ **61% faster than baseline!**
- Tool calls: **1** `search_resources` call (down from 4 baseline, 5 after first opt, 3 after reindex) ✅✅✅
- **Prompt tokens: 8,205** (down 88% from baseline 69,849!)
- Completion tokens: 4,416
- Reasoning tokens: 2,944 (still present despite low reasoning setting)
- **Total: 12,621 tokens** (down 84% from baseline 79,370)

**Analysis**:
- **Combined 124.3 second improvement** from baseline (202.9s → 78.6s)
- **ONE perfect targeted search** instead of 3-5 progressive refinement searches
- Prompt change from "broad queries" → "targeted searches matching user intent" was critical
- Token usage down 88% = massive context reduction
- Both speed AND accuracy improved

**Key Insights**:
1. Larger, section-based chunks preserve semantic coherence
2. Targeted search queries > progressive refinement
3. "Match user intent" guidance > "use broad queries"
4. Low reasoning effort reduces overhead (though still generates some reasoning tokens)

## Future Optimization Ideas

**High Priority** (NOT YET IMPLEMENTED):
- [ ] **Add topic/theme metadata** to fragments for better search targeting
  - Extract topics from section headings during chunking
  - Index topics in vector embeddings or as separate metadata field
  - Allows agent to target specific game mechanics more precisely

**Medium Priority** (reducing tool call count from 5 → 1-2):
- [ ] Improve tool description to encourage comprehensive initial queries
- [ ] Add examples of good vs bad search queries to prompt
- [ ] Consider adding search result quality/confidence score
- [ ] Track search call count per query and analyze patterns

**Low Priority**:
- [ ] Cache frequently accessed game knowledge
- [ ] Optimize vector search parameters (HNSW tuning)
- [ ] Test different embedding models (currently using `text-embedding-3-small`)
- [ ] Optimize full-text search query building
- [ ] Pre-warm database connections

**Rejected/Deprioritized**:
- ~~Strip image metadata~~ - Images are valuable content, should be preserved
