# GameGame Workers - Quick Start

## What We've Built

A Cloudflare Workers implementation of GameGame with:

✅ **Complete API** - Chat (streaming), Games, Auth
✅ **Hybrid Search** - Vectorize + D1 FTS5 + RRF fusion
✅ **D1 Database** - SQLite with FTS5 full-text search
✅ **R2 Storage** - For PDFs and images
✅ **Authentication** - JWT-based with magic links
✅ **Rate Limiting** - KV-based
✅ **Job Tracking** - For async PDF processing

## Quick Start

### 1. Install Dependencies

```bash
cd workers
pnpm install
```

### 2. Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create gamegame
# Copy database_id to wrangler.toml under [[d1_databases]]

# Create Vectorize index
wrangler vectorize create gamegame-embeddings --dimensions=1536 --metric=cosine

# Create R2 bucket
wrangler r2 bucket create gamegame-files

# Create KV namespaces
wrangler kv:namespace create RATE_LIMIT
wrangler kv:namespace create JOB_STATUS
# Copy namespace IDs to wrangler.toml under [[kv_namespaces]]

# Create queue
wrangler queues create resource-processing
wrangler queues create resource-processing-dlq
```

### 3. Update wrangler.toml

Edit `wrangler.toml` and fill in the IDs from above:

```toml
[[d1_databases]]
binding = "DB"
database_name = "gamegame"
database_id = "YOUR_D1_DATABASE_ID"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "YOUR_RATE_LIMIT_KV_ID"

[[kv_namespaces]]
binding = "JOB_STATUS_KV"
id = "YOUR_JOB_STATUS_KV_ID"
```

### 4. Set Secrets

```bash
# OpenAI API key
wrangler secret put OPENAI_API_KEY

# Mistral API key (for PDF OCR)
wrangler secret put MISTRAL_API_KEY

# JWT secret (generate with: openssl rand -base64 32)
wrangler secret put JWT_SECRET
```

### 5. Run Migrations

```bash
# Apply D1 migrations locally
pnpm db:migrate:local
```

### 6. Start Development Server

```bash
pnpm dev
```

The API will be available at `http://localhost:4000`

## Test the API

### Check Health

```bash
curl http://localhost:4000/health
```

### Create a Game (requires admin)

First, you'll need to create an admin user manually in D1:

```bash
wrangler d1 execute gamegame --local --command "
  INSERT INTO users (id, email, name, is_admin, created_at, updated_at)
  VALUES ('admin-1', 'admin@example.com', 'Admin', 1, $(date +%s), $(date +%s))
"
```

Then login to get a session:

```bash
# Request magic link
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com"}'

# In development mode, this will return a loginUrl - visit it in your browser
```

### Create a Game

```bash
curl -X POST http://localhost:4000/api/games \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_ID" \
  -d '{
    "name": "Arcs",
    "bggUrl": "https://boardgamegeek.com/boardgame/350235/arcs"
  }'
```

### Test Chat

```bash
curl -X POST http://localhost:4000/api/games/GAME_ID/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "How does setup work?"}
    ]
  }'
```

## What's Working

- ✅ **Chat API** - Streaming responses with AI SDK
- ✅ **Hybrid Search** - Vectorize + D1 FTS5 with RRF fusion
- ✅ **Games CRUD** - Create, read, update, delete games
- ✅ **Authentication** - Magic link login (email sending TODO)
- ✅ **Rate Limiting** - IP-based with KV
- ✅ **Database** - D1 with FTS5 full-text search

## What's Not Done

- ⏳ **PDF Processing Queue** - Async job processing (need to port extraction code)
- ⏳ **Admin UI** - Server-rendered pages with Hono JSX
- ⏳ **React Chat Bundle** - Client-side SPA
- ⏳ **Email Sending** - Cloudflare Email Workers integration
- ⏳ **Resources API** - Upload and manage PDFs

## Architecture Highlights

### Hybrid Search

Instead of a single PostgreSQL query with CTEs, we now:

1. Run **vector search** (Vectorize) and **full-text search** (D1 FTS5) in parallel
2. Merge results using **Reciprocal Rank Fusion** in application code
3. Fetch final fragment data from D1

This gives us similar quality to PostgreSQL while using Cloudflare-native services.

### Database Schema

**D1 (SQLite)** replaces PostgreSQL:
- No JSONB → Store JSON as TEXT, parse on read
- No arrays → Store as JSON strings
- No vector type → Use Vectorize separately
- FTS5 for full-text search instead of tsvector

### Streaming Chat

The AI SDK's `streamText()` works perfectly with Workers:

```typescript
const result = streamText({
  model: openai(MODEL),
  system: buildPrompt(game),
  messages: convertToCoreMessages(messages),
  tools: getTools(gameId, db, vectorIndex),
});

return result.toDataStreamResponse();
```

## Next Steps

To complete the migration:

1. **Copy PDF extraction code** from main project (`lib/pdf.ts`, `lib/services/chunking.ts`, etc.)
2. **Implement queue consumer** for async PDF processing
3. **Build admin UI** with Hono JSX (or keep it simple with HTML)
4. **Bundle React chat** as standalone SPA
5. **Add email sending** with Cloudflare Email Workers

## Deployment

```bash
# Deploy to production
pnpm deploy --env production

# Apply migrations to production database
pnpm db:migrate:remote
```

## Monitoring

View logs:
```bash
wrangler tail
```

View D1 data:
```bash
wrangler d1 execute gamegame --command "SELECT * FROM games"
```

View Vectorize stats:
```bash
wrangler vectorize info gamegame-embeddings
```
