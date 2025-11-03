# Performance Testing Notes

This document tracks performance observations and testing procedures for the GameGame chat agent.

## Current Performance

**Agent**: OpenAI Agents SDK with gpt-5 model

**Test Queries**:
- Complex: "How do the docks work?" (speakeasy-2025)
- Simple: "How many players?" (speakeasy-2025)

### Final Optimization - ALWAYS BE BRIEF (2025-11-02 - Latest)

**Changes Applied**:
1. Added CRITICAL instruction: "Make EXACTLY ONE search_resources call" (`src/lib/ai/prompt.ts:156`)
2. Added "ALWAYS BE BRIEF" answer style guidance (`src/lib/ai/prompt.ts:158-162`)
3. Fixed query parameter to encourage natural language vs keyword stuffing (`src/lib/ai/tools.ts:96`)
   - Before: "Use specific, targeted terms related to the mechanic or rule being asked about"
   - After: "Natural language search query. Use the user's question directly or rephrase it clearly. DO NOT keyword stuff."
4. Added `think` tool for reasoning transparency (`src/lib/ai/tools.ts:244`, `src/lib/ai/prompt.ts:151-154`)

**Results**:

**Simple Question** ("How many players?"):
- **Total time: 8.9 seconds** ✅ **96% faster than baseline (202.9s)**
- Tool calls: **1** ✅
- **Total tokens: 6,588** (down 92% from baseline 79,370)

**Complex Question** ("How do the docks work?"):
- **Total time: 26.4 seconds** ✅ **87% faster than baseline (202.9s)**
- Tool calls: **1** ✅
- **Total tokens: 7,982** (down 90% from baseline 79,370)

**Answer Quality**:
- Bullet point format for complex answers - highly scannable
- Concise summaries with relevant follow-up questions
- Users can drill deeper via follow-ups instead of getting walls of text

**Final Analysis**:
- ✅ **Baseline: 202.9s → Final: 9-26s = 87-96% faster**
- ✅ **Token reduction: 90-92%**
- ✅ Natural language queries (no keyword stuffing)
- ✅ All questions use exactly 1 search
- ✅ Brief, scannable answers

### After Prompt Cleanup (2025-11-02 - Previous Iteration)

**Changes Applied**:
1. Cleaned up search_resources tool description (`src/lib/ai/tools.ts:92-96`)
   - Removed redundant "specific to this game only" phrase
   - Removed verbose list of use cases
   - Simplified to: "Search the rulebook for relevant content. Returns text chunks with page numbers and section context."
   - Improved query parameter description: "Search query matching the user's question intent. Use specific, targeted terms related to the mechanic or rule being asked about."
2. Simplified search strategy guidance in prompt (`src/lib/ai/prompt.ts:193-204`)
   - Reduced from 34 lines to 11 lines
   - Removed redundant use case lists
   - Kept core strategy: ONE search, match user intent, limit 2-3 for simple / 5 for complex
3. Removed all share_thinking guidance from prompt (`src/lib/ai/prompt.ts:168-186`)
   - Trust that the agent knows how to use the tool from its own description
   - Removed 18 lines of DO/DON'T examples

**Results**:

**Complex Question** ("How do the docks work?"):
- **Total time: 38.0 seconds** ✅ **51.6% faster than previous 78.6s**
- Tool calls: **1** (perfect!) ✅
- **Prompt tokens: 8,210** (similar to previous)
- Completion tokens: 3,309
- Reasoning tokens: 2,624
- **Total: 11,519 tokens**

**Simple Question** ("How many players?"):
- **Total time: 29.8 seconds** ⚠️
- Tool calls: **4** (too many - should be 1)
- **Prompt tokens: 29,925** (high due to 4 searches)
- Completion tokens: 1,225
- Reasoning tokens: 832
- **Total: 31,150 tokens**

**Analysis**:
- ✅ Complex questions now work perfectly with 1 targeted search
- ⚠️ Simple questions still overthinking (4 searches instead of 1)
- Prompt cleanup successfully reduced noise without harming complex question performance
- Issue: Agent treats "How many players?" as needing full setup explanation rather than just answering the player count
- Query formulation is good, but agent is doing unnecessary follow-up searches

### After Optimization (2025-11-02 - Previous)

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

## Reinforcement Training Playbook

### Test Question Suite (Speakeasy-2025)

Use these questions to validate prompt changes and ensure consistent performance:

**Simple Factual Questions** (target: <20s, 1 search, 1-2 sentences):
1. "How many players?" → Expected: "1-4 players" + citation
2. "How much money does each player start with?" → Expected: "$15 cash + $30 in Safe" + citation
3. "Can I move trucks on other players' turns?" → Expected: "No" + brief explanation

**Complex Questions** (target: <35s, 1 search, bullet points):
1. "How do the docks work?" → Expected: Bullet list with attack mechanics + follow-ups
2. "How does setup work?" → Expected: Bullet list with key steps + follow-ups

**Edge Cases** (target: <30s, 1 search, 2-3 sentences):
1. "What happens when I run out of money?" → Expected: Brief explanation + laundering mechanic

### Validation Criteria

✅ **Performance**:
- Simple: <20s, <10k tokens
- Complex: <35s, <12k tokens
- All questions: exactly 1 tool call

✅ **Answer Quality**:
- Simple: 1-2 sentences maximum
- Complex: Bullet points, 2-4 main points
- ALL: Relevant follow-up questions
- ALL: Proper citations with page numbers

✅ **Format**:
- Use bullet points for lists/steps
- Use numbered citations [1][2]
- Include confidence and ambiguities when appropriate

### Current Performance (Latest Test Run)

| Question | Time | Calls | Tokens | Format | Result |
|----------|------|-------|--------|--------|--------|
| How many players? | 8.9s | 1 | 6,588 | 1 sentence | ✅ |
| Starting money? | 8.9s | 1 | 6,956 | 1 sentence | ✅ |
| Trucks on others' turns? | 11.5s | 1 | 7,907 | 1 sentence | ✅ |
| How do docks work? | 26.4s | 1 | 7,982 | Bullets | ✅ |
| How does setup work? | 10.8s | 1 | 8,318 | Bullets | ✅ |
| Run out of money? | 8.2s | 1 | 7,927 | 1 sentence | ✅ |

**Status**: All questions meeting targets! 🎯

### Prompt Engineering Best Practices

Based on the optimization journey, here are the key principles that achieved 86-92% performance improvement:

**1. Explicit Constraints Beat Guidance**
- ❌ "You should need ONLY 1 search for most questions"
- ✅ "Make EXACTLY ONE search_resources call"
- **Why**: Direct imperatives prevent overthinking

**2. Position Critical Instructions First**
- Place "CRITICAL" constraints immediately before the relevant section
- The agent pays most attention to instructions closest to the decision point

**3. Brief Prompts > Verbose Prompts**
- Removed 34 lines of examples → 1 line instruction
- Token reduction = faster inference
- Less context = less confusion

**4. Answer Style Over Answer Thoroughness**
- "ALWAYS BE BRIEF" with specific maximums (1-2 sentences, 2-4 bullets)
- Explicit "NEVER write lengthy explanations"
- Redirect verbosity to follow-ups

**5. Tool Descriptions Should Be Minimal**
- ❌ "Search this game's rulebook text for rules, setup instructions, gameplay mechanics, clarifications, and game information..."
- ✅ "Search the rulebook for relevant content. Returns text chunks with page numbers and section context."
- For hybrid search (semantic + full-text): encourage natural language, not keyword stuffing

**6. Remove Redundancy Aggressively**
- "specific to this game only" → unnecessary (tool is scoped by gameId)
- Don't repeat what the parameter descriptions already say
- Trust the agent to understand from minimal context

**7. Use Formatting for Scannability**
- CRITICAL, ALWAYS, NEVER → agent can quickly identify non-negotiables
- Bullet points in prompts → encourages bullet points in answers
- Clear hierarchy with headers

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
4. **Fragment Count**: Number of text chunks returned (default: 5, configurable 1-10)
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

**Low Priority**:
- [ ] Cache frequently accessed game knowledge
- [ ] Optimize vector search parameters (HNSW tuning)
- [ ] Test different embedding models (currently using `text-embedding-3-small`)
- [ ] Optimize full-text search query building
- [ ] Pre-warm database connections

**Rejected/Deprioritized**:
- ~~Strip image metadata~~ - Images are valuable content, should be preserved
