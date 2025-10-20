# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Cloudflare Workers version of GameGame.

## Project Overview

GameGame is an LLM-powered board game assistant built on Cloudflare Workers. It uses OpenAI's GPT models and implements a RAG (Retrieval-Augmented Generation) system with hybrid search combining Cloudflare Vectorize and D1 FTS5.

## Development Commands

### Setup
```bash
pnpm install
pnpm db:migrate:local      # Create local D1 database and run migrations
```

### Running the Application
```bash
pnpm dev                   # Start dev server at localhost:4000
pnpm type-check            # Run TypeScript compiler
pnpm build                 # Build production bundle (dry-run)
pnpm deploy                # Deploy to Cloudflare Workers
```

### Database Operations
```bash
pnpm db:generate           # Generate new migration from schema changes
pnpm db:migrate:local      # Apply migrations to local D1
pnpm db:migrate:remote     # Apply migrations to production D1
pnpm db:studio             # Open Drizzle Studio UI
```

### Client Build
```bash
pnpm build:client          # Build React chat widget (331KB bundle)
```

## PDF Extraction

The system uses the **Mistral OCR API** for PDF extraction:
- Fast: 3-5 seconds per PDF
- High quality: Preserves structure, tables, markdown
- Native page numbers
- Cost: $0.001/page
- Requires: `MISTRAL_API_KEY`

## Architecture

### Cloudflare Stack

- **Compute**: Cloudflare Workers (Hono web framework)
- **Database**: D1 (SQLite) for relational data
- **Vector Search**: Vectorize (1536-dim embeddings)
- **Full-Text Search**: D1 FTS5 (SQLite full-text search)
- **Storage**: R2 for PDFs and images
- **Cache**: KV for rate limiting and job status
- **Queue**: Cloudflare Queues for async PDF processing
- **AI**: OpenAI GPT-4o for chat, text-embedding-3-small for embeddings

### Database Schema (D1/SQLite)

The system uses D1 (SQLite) with five core tables:

- **games**: Board game metadata (name, image URL, BGG URL)
- **bgg_games**: Cached BoardGameGeek game data
  - JSON strings for arrays (publishers, designers, categories)
  - Cached to avoid repeated BGG API calls (5-second rate limit)
- **resources**: Game rulebooks and materials (PDFs converted to text)
- **attachments**: Media extracted from resources (images from PDFs)
  - Database-generated stable IDs (nanoid)
  - Stored in R2 at `resources/{resourceId}/attachments/{id}.{ext}`
  - Metadata: type, mimeType, url, originalFilename, pageNumber, bbox, caption
  - **Note**: No Sharp image processing (not compatible with Workers) - images stored as-is
- **fragments**: Text chunks with embeddings for RAG search
  - Split into ~1000 character chunks using LangChain's RecursiveCharacterTextSplitter
  - Embeddings stored separately in Vectorize (1536 dimensions)
  - FTS5 virtual table for full-text search
  - JSON strings for metadata (no JSONB in SQLite)

**Key Differences from PostgreSQL:**
- Integer timestamps instead of timestamp type
- JSON strings instead of JSONB
- TEXT instead of array types
- FTS5 virtual table instead of tsvector/GIN index
- Vectors stored in Vectorize, not pgvector

### RAG System (`src/lib/ai/search.ts`)

The search uses **Hybrid Reciprocal Rank Fusion (RRF)** combining:
1. **Full-text search**: D1 FTS5 with `MATCH` queries
2. **Semantic search**: Vectorize vector similarity (inner product)
3. **Fusion**: Results merged with RRF (k=50) at application level

**Implementation difference from PostgreSQL:**
- PostgreSQL: Single query with CTEs combining both searches
- D1/Vectorize: Parallel queries merged in application code

```typescript
const [vectorResults, ftsResults] = await Promise.all([
  searchVectorize(vectorIndex, queryEmbedding, gameId, { limit }),
  db.prepare(`SELECT ... FROM fragments_fts WHERE MATCH ?`).all()
]);
// RRF fusion happens in TypeScript
```

### AI Prompt System (`src/lib/ai/prompt.ts`)

The LLM is given structured tools:
- `getKnowledge`: Searches the knowledge base using hybrid search
- `listResources`: Returns available rulebooks for a game
- `getAttachment`: Retrieves attachment (image/diagram) by ID from `attachment://` references

Response format is streamed with AI SDK using `streamText()`:
- Messages streamed to client via Server-Sent Events
- Tools called during generation
- React client uses `useChat()` hook from `@ai-sdk/react`

The system only answers four categories of questions:
1. Gameplay Questions (rules, setup, mechanics)
2. Knowledge Questions (available resources)
3. External Resource Questions (where to find more info)
4. GameGame Questions (about the system itself)

### Resource Processing Pipeline

**Async Processing with Queues:**

1. Admin uploads PDF URL via `/api/resources/upload`
2. Resource record created in D1 with empty content
3. Job created in KV with status tracking
4. Message enqueued to `RESOURCE_QUEUE`
5. Queue consumer worker processes asynchronously:
   - Fetches PDF
   - Extracts with Mistral OCR
   - Uploads images to R2
   - Inserts attachments into D1
   - Replaces image references
   - Chunks content
   - Generates embeddings
   - Stores in D1 + Vectorize
   - Updates resource with stats
6. Client polls `/api/resources/jobs/:jobId` for status

**Queue Configuration** (`wrangler.toml`):
```toml
[[queues.producers]]
queue = "resource-processing"
binding = "RESOURCE_QUEUE"

[[queues.consumers]]
queue = "resource-processing"
max_batch_size = 1
max_batch_timeout = 1
max_retries = 3
dead_letter_queue = "resource-processing-dlq"
```

## Data Storage and Rendering

### PDF Processing Pipeline

#### 1. PDF Extraction (`src/lib/pdf.ts`)

Same as Next.js version - Mistral OCR extracts:
- **Text content**: Markdown-formatted text per page
- **Images**: Base64-encoded images with bounding boxes
- **Sections**: Markdown headings with hierarchy
- **Page metadata**: Dimensions, DPI

#### 2. Attachment Storage (`src/lib/services/r2-storage.ts`)

**Differences from Vercel Blob:**
- Uses R2 instead of Vercel Blob
- **No Sharp image processing** (native library incompatible with Workers)
- Images stored as-is from Mistral (PNG/JPEG/WebP)
- Simple mime-type detection from buffer headers
- Path: `resources/{resourceId}/attachments/{id}.{ext}`
- R2 public URL or custom domain

```typescript
// Detect format and store directly
const mimeType = detectMimeType(imageData);  // Check PNG/JPEG/WebP signature
await bucket.put(key, imageData, { httpMetadata: { contentType: mimeType } });
```

#### 3. Attachment Reference Replacement

Same as Next.js version:
- Inline images replaced with `attachment://{id}` syntax
- LLM calls `getAttachment(id)` tool to resolve URLs
- Attachment metadata stored in fragment's `images` JSON field

#### 4. Smart Chunking (`src/lib/services/chunking.ts`)

Same strategy as Next.js version:
- Small pages (<1500 chars): Single chunk
- Multi-section pages: Split by sections
- Large sections: RecursiveCharacterTextSplitter (1000 char, 100 overlap)
- Metadata preserved: pageNumber, pageRange, section, images

#### 5. Database Storage

**D1 Schema (SQLite):**

```typescript
// resources table
export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  name: text('name').notNull(),
  url: text('url').notNull(),
  content: text('content').notNull().default(''),
  version: integer('version').notNull().default(0),
  pdfExtractor: text('pdf_extractor'),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  // Denormalized stats
  pageCount: integer('page_count'),
  imageCount: integer('image_count').default(0),
  wordCount: integer('word_count').default(0),
});

// fragments table
export const fragments = sqliteTable('fragments', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  resourceId: text('resource_id').notNull(),
  content: text('content').notNull(),
  version: integer('version').notNull().default(0),
  // Metadata (no JSONB, stored as columns)
  pageNumber: integer('page_number'),
  pageRangeStart: integer('page_range_start'),
  pageRangeEnd: integer('page_range_end'),
  section: text('section'),
  images: text('images'),  // JSON string
});

// FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE fragments_fts USING fts5(
  content,
  fragment_id UNINDEXED,
  content='fragments',
  content_rowid='rowid'
);

// Triggers to keep FTS in sync
CREATE TRIGGER fragments_ai AFTER INSERT ON fragments BEGIN
  INSERT INTO fragments_fts(rowid, fragment_id, content)
  VALUES (new.rowid, new.id, new.content);
END;
```

**Vectorize:**
- Embeddings stored separately (not in D1)
- Metadata: `{ fragmentId, gameId, resourceId, pageNumber?, section? }`
- Queried via `VECTORIZE.query(vector, { filter: { gameId }, topK })`

### Authentication (`src/middleware/auth.ts`, `src/routes/api/auth.ts`)

**JWT-based magic link authentication:**
- Email � JWT token (15 min expiry)
- Token sent via magic link (Cloudflare Email Workers placeholder)
- Verify token � Create session in D1
- Session stored as cookie (30 days)
- Middleware checks session and sets `c.get('user')`

**Key difference from NextAuth:**
- Custom implementation (NextAuth doesn't work well with Workers)
- Sessions stored in D1, not external adapter
- JWT signing with Hono's JWT utilities

### Frontend Architecture

**Server-Side Rendering (Hono JSX):**
- `/games` - Game list page
- `/games/:id` - Game detail page with chat container
- `/admin` - Admin pages

**Client-Side (React):**
- Chat widget only (`client/chat-widget.tsx`)
- Hydrates into `<div id="chat-widget">` on game pages
- Uses `@ai-sdk/react` for streaming chat
- Built with Vite � `public/chat-widget.js` (331KB, 100KB gzipped)
- Served as static asset via Wrangler `[site]` config

**Rendering Flow:**
1. User visits `/games/abc123`
2. Hono renders SSR page with chat widget container
3. Browser loads `/chat-widget.js`
4. React hydrates into `#chat-widget`
5. User types message
6. `useChat()` POSTs to `/api/games/abc123/chat`
7. Worker streams AI response via SSE

### File Structure

```
workers/
   client/
      chat-widget.tsx          # React chat component (built to public/)
   src/
      index.ts                 # Main Hono app + routing
      types.ts                 # Env bindings & TypeScript types
      lib/
         ai/
            embeddings.ts    # OpenAI embedding generation
            prompt.ts        # LLM system prompt & tools
            search.ts        # Hybrid search (Vectorize + FTS5 + RRF)
            vectorize.ts     # Vectorize interface
         db/
            index.ts         # Drizzle ORM setup
            schema/d1.ts     # D1/SQLite schema
         jobs/status.ts       # KV-based job tracking
         pdf.ts               # Mistral OCR extraction
         processing/
            pdf-processor.ts # Complete PDF pipeline
         services/
             chunking.ts      # Smart text chunking
             r2-storage.ts    # R2 image upload (no Sharp)
      middleware/
         auth.ts              # JWT session middleware
         ratelimit.ts         # KV-based rate limiting
      routes/
         api/
            auth.ts          # Magic link auth endpoints
            chat.ts          # Streaming chat with AI SDK
            games.ts         # Game CRUD
            resources.ts     # Resource upload & job status
         pages/
             admin.tsx        # Admin UI (Hono JSX)
             games.tsx        # Game list & detail (Hono JSX)
      workers/
          resource-processor.ts # Queue consumer
   drizzle/                     # D1 migrations
   public/                      # Built assets (chat-widget.js)
   wrangler.toml                # Cloudflare config
   vite.config.client.ts        # React widget build
   tsconfig.json
```

## Environment Variables

### Local Development (`.dev.vars`)
```
OPENAI_API_KEY=sk-...
MISTRAL_API_KEY=...
JWT_SECRET=...  # Generate with: openssl rand -base64 32
```

### Production (Wrangler Secrets)
```bash
pnpx wrangler secret put OPENAI_API_KEY
pnpx wrangler secret put MISTRAL_API_KEY
pnpx wrangler secret put JWT_SECRET
```

### Wrangler Config Variables (`wrangler.toml`)
```toml
[vars]
ENVIRONMENT = "development"  # or "production"
```

## Key Design Decisions

### 1. Why Cloudflare Workers vs Next.js/Vercel?

**Advantages:**
- Lower cost at scale
- Global edge deployment
- Integrated D1, Vectorize, R2, Queues
- No cold starts (Workers are fast)
- Native streaming support

**Tradeoffs:**
- No native Node.js libraries (e.g., Sharp)
- Learning curve for D1/Vectorize APIs
- Less mature ecosystem than Next.js

### 2. Why Parallel Queries for Hybrid Search?

D1 doesn't support CTEs combining FTS5 and external data (Vectorize), so we:
1. Query Vectorize and FTS5 in parallel
2. Merge results with RRF in application code
3. Performance: ~same as PostgreSQL single query (parallel execution)

### 3. Why Store Embeddings in Vectorize vs D1?

- Vectorize is optimized for vector similarity search
- D1 has no vector similarity functions
- Separating concerns: D1 for relational, Vectorize for vectors
- Allows independent scaling

### 4. Why JSON Strings Instead of JSONB?

SQLite doesn't have JSONB. Alternatives:
- JSON strings: Simple, works with all SQLite versions
- JSON1 extension: Available in D1, but limited querying
- Separate tables: Overkill for simple metadata

We use JSON strings with `JSON.parse()` / `JSON.stringify()`.

### 5. Why No Sharp Image Processing?

Sharp is a native Node.js library (uses libvips). Cloudflare Workers:
- Run on V8 isolates, not full Node.js
- No native module support
- Alternative: Store images as-is from Mistral OCR

## Adding a New Game

### Via Admin UI
1. Navigate to `/admin/add-game`
2. Enter game name, optional BGG URL, image URL
3. Click "Create Game"
4. Upload PDF via `/admin/games/:id`
5. PDF processes asynchronously (check job status)

### Manual Process (Console)
```typescript
// 1. Insert game
const [game] = await db.insert(games).values({
  name: 'Arcs',
  imageUrl: 'https://...',
  bggUrl: 'https://boardgamegeek.com/boardgame/...'
}).returning();

// 2. Queue PDF for processing
await env.RESOURCE_QUEUE.send({
  jobId: 'job-123',
  resourceId: 'res-123',
  gameId: game.id,
  name: 'Core Rulebook',
  url: 'https://example.com/rulebook.pdf'
});
```

## Important Notes

- **Wrangler 4** - Using modern Workers Static Assets (`[assets]` config) instead of deprecated Workers Sites
- **Migrations must be run manually** - Not automatic in production (`pnpm db:migrate:remote`)
- **Vectorize local bindings not supported** - Use `--experimental-vectorize-bind-to-prod` for local dev
- **No email sending yet** - Magic links return URL in dev mode, Cloudflare Email Workers not configured
- **FTS5 triggers** - Keep `fragments_fts` in sync with `fragments` table
- **Embedding version** - Track with `version` column for re-indexing
- **R2 public access** - Enabled at `https://pub-da70527d01154effbf07cf2470284247.r2.dev`
- **Admin access** - Use `pnpm cli grant-admin <email>` to grant admin privileges
- **Static assets** - Served via Wrangler 4 assets binding from `./public` directory

## Troubleshooting

### Dev server fails to start
```bash
# Check .dev.vars exists
cat .dev.vars

# Clear Wrangler cache
rm -rf .wrangler

# Run migrations
pnpm db:migrate:local
```

### Type errors
```bash
pnpm type-check
```

### Build fails
```bash
# Rebuild client
pnpm build:client

# Check build
pnpm build
```

### Vectorize in local dev
```bash
# Use production Vectorize in local dev
pnpm dev --experimental-vectorize-bind-to-prod
```

### Database issues
```bash
# Reset local D1
rm -rf .wrangler/state
pnpm db:migrate:local
```

## CLI Tools

The project includes a CLI tool for administrative tasks:

```bash
# Grant admin privileges to a user
pnpm cli grant-admin user@example.com          # Local database
pnpm cli grant-admin user@example.com --remote # Production database
```

The CLI is located at `cli.ts` and can be extended with additional commands as needed.

## TODO

- [x] Implement BoardGameGeek integration
- [x] Configure R2 public domain/subdomain
- [x] Add admin grant utility
- [ ] Configure Cloudflare Email Workers for magic links
- [ ] Add test suite (Vitest for Workers)
- [ ] Production deployment guide (monitoring, rollback, etc.)
