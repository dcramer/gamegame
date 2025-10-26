# CLAUDE.md

Guidance for Claude Code when working with the Cloudflare Workers version of GameGame.

## Project Overview

LLM-powered board game assistant built on Cloudflare Workers with RAG using Vectorize (vector search) and D1 FTS5 (full-text search).

**Stack**: Workers + D1 (SQLite) + Vectorize + R2 + KV + Queues | OpenAI GPT-5 + text-embedding-3-small | Mistral OCR

## Essential Commands

```bash
# Setup
pnpm install
pnpm db:migrate:local

# Development
pnpm dev                    # Start server (localhost:4000)
pnpm type-check
pnpm test

# Database
pnpm db:generate            # Generate migration from schema
pnpm db:migrate:local       # Apply local
pnpm db:migrate:remote      # Apply production
pnpm db:studio

# Deployment
pnpm build
pnpm deploy

# CLI Tools
pnpm cli games
pnpm cli ask <game-slug> "<question>"
pnpm cli grant-admin <email> [--remote]
```

## Testing Chat Changes

```bash
# Basic test
pnpm cli ask speakeasy-2025 "How many players?"

# Performance measurement
time pnpm cli ask catan-starfarers-2019 "How do I setup for 3 players?"
```

### Performance Debugging

Add to `.dev.vars`:
```bash
CHAT_DEBUG_VERBOSE=true    # Tool call traces
CHAT_DEBUG_TIMING=true     # Performance metrics
```

Watch server stdout for detailed logs after each request. See [docs/performance-testing.md](./docs/performance-testing.md) for comprehensive testing guide.

## Architecture Quick Reference

### Database (D1/SQLite)
- **games**: Game metadata
- **bgg_games**: Cached BoardGameGeek data (avoid API rate limits)
- **resources**: PDFs converted to markdown (Mistral OCR)
- **attachments**: Images from PDFs (stored in R2, referenced via `attachment://`)
- **fragments**: Text chunks (~1000 chars) with FTS5 index + Vectorize embeddings

**Key differences from PostgreSQL**: Integer timestamps, JSON strings (no JSONB), FTS5 virtual table (not tsvector/GIN), vectors in Vectorize (not pgvector)

### RAG Search (`src/lib/ai/search.ts`)
Hybrid Reciprocal Rank Fusion (RRF):
1. Vectorize semantic search (parallel)
2. D1 FTS5 full-text search (parallel)
3. Merge with RRF (k=50) in application code

### AI System (`src/lib/ai/prompt.ts`)
Tools: `search_resources`, `search_media`, `listResources`, `getAttachment`, `finish`

Streaming via AI SDK `streamText()` → SSE → React `useChat()`

### Resource Processing Pipeline
1. Admin uploads PDF → `/api/resources/upload`
2. Create job in KV, enqueue to `RESOURCE_QUEUE`
3. Queue consumer: fetch → Mistral OCR → R2 upload → chunk → embed → D1+Vectorize
4. Client polls `/api/resources/jobs/:jobId`

### File Structure
```
src/
  index.ts                    # Main Hono app
  types.ts                    # Env bindings
  lib/
    ai/search.ts              # Hybrid search + RRF
    ai/prompt.ts              # System prompt + tools
    ai/embeddings.ts          # OpenAI embedding gen
    db/schema/d1.ts           # D1 schema
    pdf.ts                    # Mistral OCR
    processing/pdf-processor.ts  # Complete pipeline
    services/chunking.ts      # Smart text chunking
    services/r2-storage.ts    # R2 upload (no Sharp)
  middleware/auth.ts          # JWT magic link
  routes/api/
    chat-handler.ts           # Streaming chat logic
    games.ts                  # Game CRUD + chat endpoint
    resources.ts              # Upload + job status
```

## Environment Variables

**Local** (`.dev.vars`):
```
OPENAI_API_KEY=sk-...
MISTRAL_API_KEY=...
JWT_SECRET=...  # openssl rand -base64 32
```

**Production** (Wrangler secrets):
```bash
pnpx wrangler secret put OPENAI_API_KEY
pnpx wrangler secret put MISTRAL_API_KEY
pnpx wrangler secret put JWT_SECRET
```

## Important Notes

- **Migrations are manual** in production: `pnpm db:migrate:remote`
- **Vectorize local not supported**: Dev uses remote Vectorize
- **No Sharp** image processing (Workers incompatible with native libs)
- **FTS5 triggers** keep `fragments_fts` synced with `fragments` table
- **BGG rate limit**: 5 seconds between API calls
- **R2 public URL**: `https://pub-da70527d01154effbf07cf2470284247.r2.dev`
- **Embedding version tracking**: `version` column for re-indexing

## ⚠️ CRITICAL: Data Safety Rules

**NEVER run these commands unless explicitly instructed by the user:**
- `rm -rf .wrangler/state` (deletes ALL local database data)
- `rm -rf .wrangler/` (deletes all local state)
- Any `rm -rf` targeting database/data directories

**When encountering database issues:**
1. **Stop and analyze** the problem first
2. **Propose solutions** without executing them
3. **Ask for permission** before ANY destructive operation
4. **Default to least destructive approach** (e.g., rebuild FTS5 index instead of wiping data)

**For FTS5 corruption:**
Use `rebuild-fts.sql` to fix the index without data loss (see root directory for script).

## Quick Troubleshooting

```bash
# Type errors
pnpm type-check

# Dev server not starting
# Check logs, restart dev server (doesn't delete data)
pkill -f "pnpm dev" && pnpm dev

# FTS5 index corruption (SAFE - preserves data)
pnpm wrangler d1 execute gamegame --local --file=rebuild-fts.sql
```

## Key Design Decisions

**Why Cloudflare Workers?** Lower cost, global edge, integrated stack, no cold starts

**Why parallel search queries?** D1 can't combine FTS5 + Vectorize in single query; parallel execution is equally fast

**Why Vectorize for embeddings?** Optimized for vector similarity; D1 has no vector functions

**Why no Sharp?** Native library incompatible with V8 isolates; store images as-is from Mistral

**Why JSON strings?** SQLite lacks JSONB; simple strings work with all versions
