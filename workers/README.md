# GameGame Workers

Cloudflare Workers implementation of **GameGame** - an LLM-powered board game assistant that helps players understand game rules through natural language chat.

## Features

- 🎲 **Natural language Q&A** - Ask questions about game rules and get accurate, cited answers
- 📚 **PDF Rulebook Processing** - Automatically extracts and indexes game rulebooks using Mistral OCR
- 🔍 **Hybrid Search** - Combines semantic search (Vectorize) with full-text search (FTS5)
- 🖼️ **Image Support** - Extracts and references diagrams from rulebooks
- 🎮 **BoardGameGeek Integration** - Import games directly from BGG with metadata and images
- ⚡ **Edge Computing** - Runs on Cloudflare's global network for low latency
- 🔐 **Magic Link Auth** - Passwordless email authentication with JWT

## Tech Stack

- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: D1 (SQLite) for relational data
- **Vector Search**: Cloudflare Vectorize (1536-dim OpenAI embeddings)
- **Full-Text Search**: SQLite FTS5
- **Storage**: R2 for PDFs and images
- **Queues**: Cloudflare Queues for async PDF processing
- **AI**: OpenAI GPT-4o + text-embedding-3-small
- **OCR**: Mistral OCR API
- **Frontend**: Hono JSX (SSR) + React chat widget

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ with pnpm
- [Cloudflare account](https://dash.cloudflare.com/sign-up) with Workers paid plan (for D1, Vectorize, R2)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Create Cloudflare Resources

Create the required Cloudflare resources for your project:

```bash
# Create D1 database
pnpx wrangler d1 create gamegame
# Copy the database_id from output to wrangler.toml

# Create Vectorize indexes (1536 dimensions for OpenAI text-embedding-3-small)
pnpx wrangler vectorize create gamegame-embeddings --dimensions=1536 --metric=cosine
pnpx wrangler vectorize create gamegame-embeddings-preview --dimensions=1536 --metric=cosine

# Create R2 bucket for files
pnpx wrangler r2 bucket create gamegame-files

# Create KV namespaces
pnpx wrangler kv namespace create RATE_LIMIT_KV
pnpx wrangler kv namespace create JOB_STATUS_KV
# Copy the IDs from output to wrangler.toml

# Create queues for async processing
pnpx wrangler queues create resource-processing
pnpx wrangler queues create resource-processing-dlq
```

### 3. Configure R2 Public Access

To serve game images and attachments publicly, configure R2:

**Option 1: R2.dev subdomain (easiest)**
```bash
# Enable public access via R2.dev domain
pnpx wrangler r2 bucket public-access enable gamegame-files
```

Then update these files with your R2.dev URL:
- `src/lib/services/r2-storage.ts` line 59
- `src/routes/api/bgg.ts` line 84

**Option 2: Custom domain**
- Configure custom domain in Cloudflare dashboard
- Update same files with your domain

### 4. Set Secrets

Create `.dev.vars` for local development:

```bash
# .dev.vars
OPENAI_API_KEY=sk-...
MISTRAL_API_KEY=...
JWT_SECRET=...
```

Generate JWT_SECRET:
```bash
openssl rand -base64 32
```

For production, set secrets with Wrangler:
```bash
pnpx wrangler secret put OPENAI_API_KEY
pnpx wrangler secret put MISTRAL_API_KEY
pnpx wrangler secret put JWT_SECRET
```

### 5. Run Database Migrations

```bash
# Local development database
pnpm db:migrate

# Production database (after deploying)
pnpm db:migrate:remote
```

If your local schema falls out of sync (for example after editing an initial migration), reset the cached database and reapply migrations:

```bash
pnpm db:reset
```

### 6. Grant Admin Access

After creating your first user account (by logging in via the UI), grant admin privileges:

```bash
# Local database
pnpm cli grant-admin your@email.com

# Production database
pnpm cli grant-admin your@email.com --remote
```

### 7. Start Development Server

```bash
pnpm dev
```

This runs:
- Vite dev server → `http://localhost:4000` (full HMR experience)
- Wrangler dev API → `http://localhost:4001`

Open `http://localhost:4000` in your browser and:
1. Navigate to `/admin/add-game`
2. Search for a game on BoardGameGeek or add manually
3. Upload a PDF rulebook
4. Start chatting!

## Development

### Available Commands

```bash
# Development
pnpm dev                   # Start Vite + Wrangler dev servers w/ HMR
pnpm dev:vectorize         # Same as above but bind Vectorize to preview index
pnpm type-check            # Run TypeScript type checking
pnpm build                 # Build for production (dry-run)
pnpm build:client          # Build React chat widget

# Database
pnpm db:generate           # Generate migration from schema changes
pnpm db:migrate           # Apply migrations to local D1
pnpm db:migrate:remote     # Apply migrations to production D1
pnpm db:reset              # Delete local D1 state and re-run migrations
pnpm db:studio             # Open Drizzle Studio (DB browser)

# CLI Tools
pnpm cli grant-admin <email>          # Grant admin access (local)
pnpm cli grant-admin <email> --remote # Grant admin access (production)

# Deployment
pnpm deploy                # Deploy to production
```

### Local Development with Vectorize

Vectorize doesn't have local simulation yet. Local development targets the preview index so production data stays clean. Run dev with remote binding enabled:

```bash
pnpm dev:vectorize
```

This launches the same two processes (`pnpm client:dev` + `wrangler dev --experimental-vectorize-bind-to-prod`) so your local UI stays on `http://localhost:4000` while API vector search hits the preview index (`gamegame-embeddings-preview`).

### Viewing Logs

```bash
# Tail production logs
pnpx wrangler tail

# Tail with filters
pnpx wrangler tail --status error
```

## Project Structure

```
workers/
├── client/
│   └── chat-widget.tsx          # React chat component
├── src/
│   ├── index.ts                 # Main Hono app + routing
│   ├── types.ts                 # TypeScript types & bindings
│   ├── routes/
│   │   ├── api/
│   │   │   ├── auth.ts          # Magic link authentication
│   │   │   ├── chat.ts          # Streaming AI chat
│   │   │   ├── games.ts         # Game CRUD
│   │   │   ├── resources.ts     # PDF upload & processing
│   │   │   └── bgg.ts           # BoardGameGeek integration
│   │   └── pages/
│   │       ├── admin.tsx        # Admin UI (SSR)
│   │       └── games.tsx        # Game list & chat (SSR)
│   ├── lib/
│   │   ├── db/                  # Drizzle ORM schema
│   │   ├── ai/
│   │   │   ├── embeddings.ts    # OpenAI embedding generation
│   │   │   ├── prompt.ts        # LLM system prompt & tools
│   │   │   ├── search.ts        # Hybrid search (RRF)
│   │   │   └── vectorize.ts     # Vectorize interface
│   │   ├── services/
│   │   │   ├── bgg.ts           # BGG API integration
│   │   │   ├── chunking.ts      # Smart text chunking
│   │   │   └── r2-storage.ts    # R2 file uploads
│   │   ├── processing/
│   │   │   └── pdf-processor.ts # Complete PDF pipeline
│   │   ├── jobs/
│   │   │   └── status.ts        # KV job tracking
│   │   └── pdf.ts               # Mistral OCR extraction
│   ├── middleware/
│   │   ├── auth.ts              # JWT session middleware
│   │   └── ratelimit.ts         # KV rate limiting
│   └── workers/
│       └── resource-processor.ts # Queue consumer
├── drizzle/                     # D1 migrations
├── public/                      # Static assets (built)
├── wrangler.toml                # Cloudflare configuration
└── vite.config.client.ts        # React widget build config
```

## How It Works

### PDF Processing Pipeline

1. **Upload**: Admin uploads PDF URL via `/admin/games/:id`
2. **Queue**: Job created in KV, message sent to Cloudflare Queue
3. **Extract**: Worker fetches PDF and sends to Mistral OCR API
4. **Process**:
   - Extracts text, images, and structure
   - Uploads images to R2
   - Replaces inline images with `attachment://` references
5. **Chunk**: Splits text into ~1000 char chunks using LangChain
6. **Embed**: Generates OpenAI embeddings for each chunk
7. **Store**: Saves to D1 (metadata + FTS5) and Vectorize (embeddings)
8. **Complete**: Job status updated, resource ready for chat

### Chat & RAG System

1. **User Message**: User asks a question about the game
2. **Hybrid Search**:
   - Generate query embedding (OpenAI)
   - Search Vectorize (semantic similarity)
   - Search D1 FTS5 (keyword matching)
   - Fuse results with Reciprocal Rank Fusion (RRF)
3. **Context Building**: Top 10 fragments retrieved with metadata
4. **LLM Generation**: GPT-4o generates answer with:
   - System prompt defining behavior
   - Tools: `getKnowledge`, `listResources`, `getAttachment`
   - Streaming response via Server-Sent Events
5. **Citation**: Responses include page numbers and resource references

## Configuration

### Environment Variables

**Required Secrets** (`.dev.vars` or `wrangler secret put`):
- `OPENAI_API_KEY` - OpenAI API key for chat & embeddings
- `MISTRAL_API_KEY` - Mistral API key for PDF OCR
- `JWT_SECRET` - Secret for JWT signing (32+ chars)

**Optional Variables** (`wrangler.toml` `[vars]`):
- `ENVIRONMENT` - "development" or "production" (default: "development")

### Cloudflare Bindings

Configured in `wrangler.toml`:
- `DB` - D1 database (SQLite)
- `VECTORIZE` - Vectorize index (vector search)
- `FILES` - R2 bucket (file storage)
- `RATE_LIMIT_KV` - KV namespace (rate limiting)
- `JOB_STATUS_KV` - KV namespace (job tracking)
- `RESOURCE_QUEUE` - Queue (async PDF processing)

## Deployment

### First Deployment

1. **Run migrations**:
   ```bash
   pnpm db:migrate:remote
   ```

2. **Deploy Worker**:
   ```bash
   pnpm deploy
   ```

3. **Set secrets** (if not already set):
   ```bash
   pnpx wrangler secret put OPENAI_API_KEY
   pnpx wrangler secret put MISTRAL_API_KEY
   pnpx wrangler secret put JWT_SECRET
   ```

4. **Grant admin access** to your user account:
   ```bash
   pnpm cli grant-admin your@email.com --remote
   ```

### Subsequent Deployments

```bash
# If schema changed, run migrations first
pnpm db:migrate:remote

# Deploy
pnpm deploy
```

### Production vs Development

Configure different environments in `wrangler.toml`:

```toml
[env.production]
name = "gamegame-production"
vars = { ENVIRONMENT = "production" }

[env.development]
name = "gamegame-dev"
vars = { ENVIRONMENT = "development" }
```

Deploy to specific environment:
```bash
pnpm deploy --env production
```

## Troubleshooting

### Dev server won't start

```bash
# Clear Wrangler cache
rm -rf .wrangler

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Run migrations
pnpm db:migrate:local
```

### Type errors

```bash
pnpm type-check
```

### Database issues

```bash
# Reset local database
rm -rf .wrangler/state
pnpm db:migrate:local
```

### Vectorize errors in local dev

Use production Vectorize binding:
```bash
pnpm dev --experimental-vectorize-bind-to-prod
```

### Images not loading

Check R2 public access configuration:
1. Enable R2.dev subdomain: `wrangler r2 bucket public-access enable gamegame-files`
2. Update URL in `src/lib/services/r2-storage.ts` line 59
3. Update URL in `src/routes/api/bgg.ts` line 84

## Known Limitations

- **No email sending**: Magic links return URL in dev mode. Production needs Cloudflare Email Workers configuration
- **No image processing**: Images stored as-is from Mistral OCR (Sharp not compatible with Workers)
- **Vectorize local dev**: Must use `--experimental-vectorize-bind-to-prod` flag
- **Manual migrations**: Must run `pnpm db:migrate:remote` manually for production

## Version Information

- **Wrangler**: 4.43.0 (using modern Workers Static Assets)
- **Vite**: 7.1.10
- **Hono**: 4.6.14+
- **Node.js**: 18+ required

## Roadmap

- [ ] Configure Cloudflare Email Workers for magic link emails
- [ ] Add test suite (Vitest for Workers)
- [ ] Admin CLI utilities
- [ ] Performance monitoring & analytics
- [ ] Multi-game chat context
- [ ] PDF upload via R2 presigned URLs

## Documentation

See [`CLAUDE.md`](./CLAUDE.md) for detailed architecture documentation.

## License

MIT
