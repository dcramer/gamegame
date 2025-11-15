# Testing the Chat Interface with CLI

This guide covers how to test the GameGame chat interface using the CLI `ask` command during development.

## Quick Start

```bash
# Start the dev server (in one terminal)
pnpm dev

# In another terminal, ask a question
pnpm cli ask <game-slug> "How do I setup the game?"

# Enable verbose mode to see AI reasoning
pnpm cli ask <game-slug> "How many players can play?" --verbose
```

**Important notes:**
- First request after server startup is slow (~10-15s) due to compilation and cold start
- Subsequent requests are faster (~2-5s)
- The CLI has a default timeout; if you see no output after 30s, the request may have failed
- Check server logs (in the `pnpm dev` terminal) to see if the request completed

## Command Syntax

```bash
pnpm cli ask <game> <prompt> [options]
```

**Arguments:**
- `<game>` (required): Game slug (e.g., `arcs`) or game ID
- `<prompt>` (required): The question to ask - can contain spaces and special characters

**Options:**
- `--verbose`: Show detailed execution trace including tool calls, token usage, and timing

## Common Testing Scenarios

### 1. Basic Question Answering

Test simple factual questions:

```bash
pnpm cli ask <game-slug> "How many players?"
pnpm cli ask <game-slug> "What is the objective?"
pnpm cli ask <game-slug> "How long does a game take?"
```

**Expected behavior:**
- Streaming response starts within 5-15 seconds (first request slower)
- Answer should cite page numbers and sections
- Clean, formatted markdown output
- If no output appears, check server logs for errors

**Common issues:**
- **No output after 30s**: Request may have timed out or failed. Check server terminal for errors.
- **"Game not found" error**: Use `pnpm cli games list` to see available games and their slugs
- **Empty/generic response**: Game may have no processed resources. Check with `pnpm cli resources list <game-slug>`

### 2. Testing Resource Search

Test the RAG (Retrieval-Augmented Generation) system:

```bash
# Complex rules question (should trigger search_resources)
pnpm cli ask <game-slug> "How does combat work?" --verbose

# Multi-step process question
pnpm cli ask <game-slug> "How do I setup the game for 4 players?" --verbose
```

**What to look for in verbose mode:**
- `[Tool] search_resources` with the query args
- `Result:` showing fragments found (truncated to 100 chars)
- `[Finish] Usage:` showing token counts
- Citations in the final answer (page numbers, sections)

**In server logs (pnpm dev terminal), you'll see:**
```
[Search] Starting search for "..." (limit=3, enableReranking=false, enableFTS=true)
[Search] Detected query types for "...": <answer-types>
[Search] Embedding generated in Xms
[Search] Found X content, Y question, Z FTS matches
[Search] Total search time: Xms, returning N results
```

### 3. Testing Media/Image Search

Test visual content retrieval:

```bash
# Request diagrams or visual aids
pnpm cli ask arcs "Show me the game board" --verbose
pnpm cli ask arcs "What does the setup look like?" --verbose
pnpm cli ask arcs "Show me the player mat" --verbose
```

**What to look for in verbose mode:**
- `tool-call: search_images` with description of visual content
- Image references in the response
- Check that images are relevant to the question

### 4. Testing Edge Cases

**Game not found:**
```bash
pnpm cli ask nonexistent-game "How do I play?"
# Expected: Error message "Game 'nonexistent-game' not found"
```

**Empty/ambiguous prompt:**
```bash
pnpm cli ask arcs ""
pnpm cli ask arcs "what"
# Expected: Still works, but answer quality may vary
```

**Very long prompt:**
```bash
pnpm cli ask arcs "I'm confused about how combat works when there are multiple ships in the same system and one player has the initiative card but another player has more ships and I also want to know if the first player token matters and what happens if..."
# Expected: LLM should handle gracefully, possibly break down into parts
```

### 5. Testing Different Question Types

The AI categorizes questions into types. Test each:

**Gameplay questions:**
```bash
pnpm cli ask arcs "How does movement work?"
```

**Knowledge questions:**
```bash
pnpm cli ask arcs "What resources are available?"
```

**External resource questions:**
```bash
pnpm cli ask arcs "Where can I find player aids?"
```

**GameGame questions:**
```bash
pnpm cli ask arcs "What can you help me with?"
```

## Understanding Output

### Normal Mode

In normal mode, you see only the streamed answer:

```
Found game: Arcs
Prompt: How many players?

Arcs supports **2-4 players** (Rulebook, page 2).

For the best experience:
- **2 players**: Competitive head-to-head
- **3-4 players**: Full alliance and betrayal dynamics

Would you like to know about setup for a specific player count?
```

### Verbose Mode

Verbose mode shows the complete execution trace:

```
Found game: Arcs
Prompt: How does combat work?

tool-call: search_resources
  query: combat rules mechanics attacking defending
  resourceType: all
  limit: 5

tool-result: [
  {
    "content": "## Combat\n\nWhen you declare combat...",
    "pageNumber": 12,
    "section": "Rules > Combat"
  }
  ... (truncated to 100 chars in display)
]

Combat in Arcs follows these steps... (answer streams here)

finish event:
  usage: { promptTokens: 1234, completionTokens: 567 }
```

**Verbose output includes:**
- All tool calls (search_resources, search_images, get_attachment)
- Tool arguments (query, resourceType, limit)
- Tool results (first 100 chars, truncated for readability)
- Token usage (input/output tokens)
- Parse errors if any occur

## AI Tools Reference

The LLM has access to these tools when answering:

### search_resources

Searches rulebook content using hybrid RAG (full-text + semantic search).

**Parameters:**
- `query` (required): Natural language search query
- `resourceType` (optional): Filter by type
  - `'all'` (default): Search all resources
  - `'rulebook'`: Only official rulebooks
  - `'expansion'`: Only expansion rules
  - `'faq'`: Only FAQs
  - `'errata'`: Only errata documents
- `limit` (optional, 1-10): Number of results (default: 5)
  - Use 2-3 for simple facts
  - Use 5+ for complex rules requiring multiple sources

**Returns:**
- Text chunks with page numbers
- Section hierarchy (e.g., "Setup > Player Setup")
- Image references if relevant

### search_images

Finds diagrams, setup photos, tables, and other visual aids with their surrounding rulebook context.

**Parameters:**
- `query` (required): Description of the image to find (e.g., "setup diagram", "player mat layout")
- `limit` (optional, 1-8): Number of images to return (default: 3)
- `imageType` (optional): Filter by detected type (`any`, `diagram`, `table`, `photo`, `icon`, `decorative`)

**Returns:**
- Image content blocks ready for display (id, url/blob key, caption, page number)
- Resource metadata (resourceId/resourceName, section)
- Enriched fields for reasoning (detected type, OCR text when available, surrounding text snippet)

### get_attachment

(Internal tool - not directly called by LLM in most cases)

Retrieves full attachment metadata by ID when the LLM encounters `attachment://` references in fragment content.

## Response Structure

The LLM returns structured data (even though you see formatted output):

```typescript
{
  content: Array<TextBlock | ImageBlock>,
  questionType?: 'gameplay' | 'knowledge' | 'external' | 'gamegame',
  citations: [
    {
      resourceName: string,
      page?: number | [number, number],
      section?: string,
      relevance: string
    }
  ],
  confidence: 'high' | 'medium' | 'low',
  ambiguities?: string[],  // Rule conflicts or unclear points
  followUps?: {
    related: string[],       // Related topics
    deeper: string[],        // More detailed questions
    clarifying: string[]     // Clarification questions
  },
  playerCountSpecific?: number | [number, number],
  expansionSpecific?: string[]
}
```

**Key fields:**
- **citations**: Sources used (check these are accurate!)
- **confidence**: How confident the AI is (useful for spotting hallucinations)
- **ambiguities**: Known rule conflicts or unclear points
- **followUps**: Suggested next questions (good for UX testing)

## Environment Setup

The CLI automatically loads environment variables from `.env.local` and `.env`.

**Required variables:**
```bash
# .env.local
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/gamegame
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Optional for testing:**
```bash
MISTRAL_API_KEY=...  # Only needed if reprocessing resources
```

**Starting services:**
```bash
# Start PostgreSQL
docker-compose up -d

# Start Next.js dev server (required for API)
pnpm dev

# In another terminal, run CLI commands
pnpm cli ask arcs "How do I play?"
```

## Troubleshooting

### "Game not found" error

**Cause:** Game doesn't exist or slug is incorrect

**Solution:**
```bash
# List available games and their slugs
pnpm cli games list

# Use exact slug from list
pnpm cli ask <correct-slug> "question"

# You can also use game ID
pnpm cli ask <game-id> "question"
```

### Connection errors / "fetch failed"

**Cause:** Dev server not running or wrong URL

**Solution:**
```bash
# Check dev server is running
curl http://localhost:3000/api/games

# Verify NEXT_PUBLIC_APP_URL in .env.local
echo $NEXT_PUBLIC_APP_URL  # Should be http://localhost:3000
```

### Empty/no response

**Cause:** OpenAI API key invalid or rate limited

**Solution:**
```bash
# Check API key is set
echo $OPENAI_API_KEY

# Check for errors with verbose mode
pnpm cli ask arcs "test" --verbose

# Check server logs in the terminal running `pnpm dev`
```

### "No resources found" in response

**Cause:** Game has no processed resources (PDFs not yet indexed)

**Solution:**
```bash
# Check resources for game
pnpm cli resources list <game-slug>

# If empty, add a resource via admin UI or CLI
# Then wait for processing to complete
pnpm cli resources status <job-id>
```

### Slow responses or no output

**Cause:**
- First request after startup (cold start): 10-15 seconds is normal
- Embedding generation: 2-5 seconds per request
- Complex question requiring multiple tool calls
- Server may be hung or crashed

**Solution:**
- **Check server logs first**: Look at the `pnpm dev` terminal for:
  - `POST /api/games/<slug>/chat 200 in Xs` - Request completed successfully
  - Error messages or stack traces
  - Search timing: `[Search] Total search time: Xms`
- If server shows 200 but CLI gets no output: Streaming response may be blocked
- Use `--verbose` to see which tool calls are slow
- Try a simpler question first: `pnpm cli ask <game-slug> "What is this game?"`
- Check OpenAI API status if consistently slow

**Performance expectations:**
- First request: 10-15s (compilation + cold start + embedding)
- Subsequent requests: 2-7s (embedding + search + LLM)
- Embedding generation: 2-5s (OpenAI API call)
- Search: 10-50ms (database queries)

### Tool calls not shown in verbose mode

**Cause:** Question didn't require knowledge base search (too simple or meta-question)

**Example:**
```bash
pnpm cli ask arcs "What can you help with?" --verbose
# May not call search_resources since it's a meta-question about capabilities
```

**Not a bug:** The LLM only uses tools when needed.

## Testing Best Practices

### 1. Test Incrementally

Start simple, then increase complexity:

```bash
# Level 1: Basic facts
pnpm cli ask arcs "How many players?"

# Level 2: Simple rules
pnpm cli ask arcs "How do I move ships?"

# Level 3: Complex interactions
pnpm cli ask arcs "What happens when two players attack the same system?"

# Level 4: Edge cases
pnpm cli ask arcs "Can I move and attack in the same turn if I have the initiative?"
```

### 2. Compare with Source Material

Always verify answers against the actual rulebook:

```bash
# Ask a question you know the answer to
pnpm cli ask arcs "How many action cards do players start with?" --verbose

# Check citations point to correct pages
# Verify answer matches rulebook content
```

### 3. Test Citation Accuracy

Use verbose mode to see which fragments were retrieved:

```bash
pnpm cli ask arcs "How does scoring work?" --verbose
```

Check:
- Are page numbers correct?
- Are sections relevant?
- Is the AI cherry-picking or using full context?

### 4. Test Cross-Document Search

If you have multiple resources (rulebook + expansions + FAQ):

```bash
# Should search across all documents
pnpm cli ask arcs "What changed in the expansion?"

# With verbose, verify it's searching multiple resources
pnpm cli ask arcs "Are there any errata for combat?" --verbose
```

### 5. Measure Quality Over Time

Keep a test suite of questions and expected answers:

```bash
#!/bin/bash
# test-chat-quality.sh

echo "Testing basic facts..."
pnpm cli ask arcs "How many players?" | grep "2-4"

echo "Testing rules..."
pnpm cli ask arcs "How does combat work?" | grep -i "combat"

echo "Testing citations..."
pnpm cli ask arcs "What is the winning condition?" --verbose | grep "page"
```

Run this after making changes to:
- Chunking strategy (`lib/services/chunking.ts`)
- Search algorithm (`lib/ai/search.ts`)
- System prompt (`lib/ai/prompt.ts`)

## Advanced Usage

### Testing Different Resource Types

If your game has multiple resource types:

```bash
# Should prioritize official rulebook
pnpm cli ask arcs "What are the rules for combat?" --verbose

# Should search FAQs for clarifications
pnpm cli ask arcs "What is the official ruling on simultaneous actions?" --verbose

# Should search errata for corrections
pnpm cli ask arcs "Were there any changes to the scoring rules?" --verbose
```

Check the `resourceType` parameter in tool calls to verify correct filtering.

### Debugging RAG Search Quality

Use verbose mode to diagnose search issues:

```bash
pnpm cli ask arcs "How do I win?" --verbose
```

Look for:
1. **Query reformulation:** Is the LLM's search query good?
   - Good: `"victory conditions winning scoring objectives"`
   - Bad: `"win"` (too vague)

2. **Result relevance:** Are the fragments returned relevant?
   - Check page numbers and sections
   - Read the truncated content snippets

3. **Citation usage:** Is the LLM using all retrieved fragments?
   - Compare citations in answer vs. tool results
   - Unused fragments might indicate poor search or LLM oversight

### Testing Token Efficiency

Monitor token usage with verbose mode:

```bash
pnpm cli ask arcs "Simple question" --verbose
# Check: usage: { promptTokens: X, completionTokens: Y }

pnpm cli ask arcs "Complex multi-part question about rules and setup" --verbose
# Compare token usage - should scale appropriately
```

**Optimization tips:**
- High promptTokens → Too many fragments retrieved (reduce `limit`)
- High completionTokens → LLM is verbose (adjust system prompt)
- Both high → Consider chunking strategy or model choice

## Known Issues and Fixes

### Bug: getGameByIdOrSlug only checked game ID (FIXED)

**File:** `lib/cli/games.ts:83`

**Issue:** The function only checked `games.id` but not `games.slug`, causing "Game not found" errors when using slugs.

**Fix:** Added `or(eq(games.id, idOrSlug), eq(games.slug, idOrSlug))` to check both.

**Status:** ✅ Fixed (you should be able to use slugs now)

### Bug: detectQueryAnswerTypes didn't handle empty responses (FIXED)

**File:** `lib/ai/search.ts:104`

**Issue:** When OpenAI returned empty content, `JSON.parse()` threw `SyntaxError: Unexpected end of JSON input`, causing search to fail.

**Fix:** Added null/empty check before JSON.parse with graceful degradation (returns empty array).

**Status:** ✅ Fixed (you may see "Empty response from query type detection" warnings in server logs, which is expected)

### Known limitation: Streaming responses may not display in CLI

**Issue:** In some cases, the server completes the request successfully (logs show `200 in Xs`) but the CLI doesn't receive/display the streaming response.

**Workaround:**
- Check server logs to confirm the request completed
- If this happens frequently, there may be an issue with the SSE (Server-Sent Events) streaming
- Try restarting both the dev server and CLI

## Related Documentation

- **Testing Overview:** `docs/testing.md`
- **CLI Commands:** `CLAUDE.md` (CLI Commands section)
- **AI System Architecture:** `CLAUDE.md` (RAG System, AI Prompt System)
- **API Endpoints:** `app/api/games/[gameIdOrSlug]/chat/route.ts`
- **AI Tools Implementation:** `lib/ai/tools.ts`
- **System Prompt:** `lib/ai/prompt.ts`
