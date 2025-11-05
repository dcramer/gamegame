# GameGame Next.js Migration

This package is a migration of the Cloudflare Workers implementation (in `../workers/`) back to Next.js and Vercel infrastructure.

## Migration Status

### ✅ Completed

1. **Package Structure**
   - Next.js 15 with App Router
   - TypeScript configuration
   - Tailwind CSS + shadcn/ui setup
   - Drizzle ORM for PostgreSQL

2. **Environment Configuration**
   - `.env.example` with all required variables
   - `lib/env.mjs` for type-safe environment validation

3. **Database Schemas (PostgreSQL + pgvector)**
   - **`games`** - Game metadata
   - **`resources`** - PDF rulebooks with processing status
   - **`fragments`** - Text/image chunks for RAG search
   - **`embeddings`** - Vector embeddings (NEW!)
     - Supports both content embeddings and HyDE question embeddings
     - Separate table design (cleaner than inline in fragments)
     - Uses pgvector for similarity search
   - **`attachments`** - Images extracted from PDFs
   - **`users`** - User accounts with admin flags
   - **`bgg_games`** - BoardGameGeek cache
   - **`jobs`** - Background job tracking (replaces KV)

### 🚧 In Progress

4. **Database Client**
   - Basic Drizzle client created
   - Need migration scripts

### ⏳ Pending

5. **AI Services**
   - Hybrid search (content vectors + question vectors + full-text)
   - Embedding generation
   - HyDE question generation
   - Prompt builder and tools

6. **Storage Layer**
   - Vercel Blob abstraction
   - Image processing utilities
   - Attachment management

7. **PDF Processing**
   - Mistral OCR integration
   - Smart chunking
   - Searchable content enrichment
   - Vision analysis

8. **Background Jobs** (Vercel Workflows)
   - 6-stage processing pipeline
   - Job status tracking
   - Scheduled cleanup

9. **API Routes**
   - Auth, games, resources, BGG, attachments

10. **UI Components**
   - Public pages (home, games, chat)
   - Admin pages (dashboard, jobs, resources)

## Key Architecture Decisions

### 1. Embeddings Table Design

Unlike the original Next.js implementation (which stored embeddings inline in the `fragments` table), this migration uses a **separate `embeddings` table**:

**Why separate?**
- Mirrors the Vectorize architecture from workers/
- Supports multiple embeddings per fragment (content + 5 questions for HyDE)
- Cleaner separation of concerns
- Easier to index and query by embedding type

**Schema:**
```sql
CREATE TABLE embeddings (
  id VARCHAR(191) PRIMARY KEY,           -- fragmentId or fragmentId-q0..q4
  fragment_id VARCHAR(191) NOT NULL,
  type VARCHAR(50) NOT NULL,             -- 'content' or 'question'
  embedding vector(1536) NOT NULL,
  question_index INTEGER,                -- 0-4 for questions, NULL for content
  question_text TEXT,                    -- The synthetic question
  ...
);
```

**Search Pattern:**
- Content vectors: `SELECT * FROM embeddings WHERE type = 'content' AND ...`
- Question vectors: `SELECT * FROM embeddings WHERE type = 'question' AND ...`
- RRF fusion combines both with full-text search

### 2. Database Differences from Workers

| Workers (D1/SQLite) | Next.js (PostgreSQL) |
|---------------------|----------------------|
| `text` (for JSON) | `jsonb` (native JSON) |
| `integer (mode: 'timestamp')` | `bigint` (Unix ms) |
| `integer (mode: 'boolean')` | `integer` (0/1) |
| Vectorize (separate service) | pgvector (same DB) |
| FTS5 virtual table | tsvector + GIN index |

### 3. Background Jobs: Vercel Workflows

Using Vercel Workflows (Beta) instead of Cloudflare Queues:

**Advantages:**
- Native Vercel integration
- Built-in retries and durability
- Visual debugging
- Simpler code (no manual queue management)

**Pipeline Stages:**
1. INGEST - PDF extraction (Mistral OCR)
2. VISION - Image analysis (GPT-4o vision)
3. CLEANUP - Markdown cleanup (LLM)
4. METADATA - Resource name/description generation
5. EMBED - Generate embeddings (content + HyDE questions)
6. FINALIZE - Mark resource ready

### 4. Storage: Vercel Blob + KV

- **Vercel Blob**: PDFs, images (replaces R2)
  - **Local Development**: Falls back to `public/uploads/` if `BLOB_READ_WRITE_TOKEN` is not set
  - **Production**: Uses Vercel Blob when token is available
  - Files stored at: `resources/{resourceId}/attachments/{attachmentId}.{ext}`
- **Vercel KV**: Rate limiting (replaces Cloudflare KV)
- **PostgreSQL**: Job status (replaces KV)

## Development

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Run database migrations
pnpm db:generate
pnpm db:migrate

# Start development server
pnpm dev

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

## Next Steps

1. Create database migration script
2. Port AI services from workers/
3. Port storage layer
4. Port PDF processing pipeline
5. Implement Vercel Workflows
6. Port API routes
7. Port UI components
8. Testing and deployment

## Environment Variables

See `.env.example` for required environment variables.

Key requirements:
- `DATABASE_URL` - PostgreSQL connection string (with pgvector extension)
- `OPENAI_API_KEY` - For embeddings and chat
- `MISTRAL_API_KEY` - For PDF extraction
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage (optional for local dev, falls back to `public/uploads/`)
- `AUTH_SECRET` - NextAuth secret
- `AUTH_RESEND_KEY` - Resend API for magic links

## Migration Notes

This migration preserves all advanced features from workers/:
- ✅ HyDE (Hypothetical Document Embeddings)
- ✅ Hybrid search (semantic + full-text + RRF fusion)
- ✅ Multi-modal fragments (text + images)
- ✅ Searchable content enrichment
- ✅ Image quality analysis
- ✅ 6-stage processing pipeline
- ✅ Job status tracking
- ✅ BGG integration with caching

The goal is to maintain feature parity while simplifying the developer experience with Next.js and Vercel's mature ecosystem.
