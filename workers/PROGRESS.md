# Migration Progress

## ✅ Completed

### Infrastructure Setup
- [x] Workers project structure created
- [x] package.json with all dependencies
- [x] TypeScript configuration
- [x] wrangler.toml with all bindings configured
- [x] Drizzle configuration for D1

### Database Layer
- [x] D1 schema (SQLite) with all tables:
  - games, resources, fragments, attachments
  - users, sessions
  - bgg_games (cache)
- [x] FTS5 virtual table for full-text search
- [x] Initial migration SQL with triggers
- [x] Drizzle ORM integration

### Core Services
- [x] Vectorize integration for vector search
- [x] Hybrid search implementation (Vectorize + D1 FTS5 + RRF fusion)
- [x] OpenAI embeddings generation
- [x] R2 storage for images/attachments
- [x] Job status tracking with KV
- [x] AI prompt system (ported from existing)

## 🚧 In Progress

### Queue Processing
- [ ] Copy PDF extraction utilities from main project
- [ ] Copy chunking logic
- [ ] Copy vision analysis
- [ ] Implement queue consumer worker
- [ ] Implement resource processing pipeline

## 📋 Remaining Tasks

### Authentication
- [ ] JWT utilities
- [ ] Magic link email templates
- [ ] Email sending with Cloudflare Email Workers
- [ ] Session management middleware

### API Routes (Hono)
- [ ] Chat endpoint (streaming)
- [ ] Games CRUD
- [ ] Resources upload/management
- [ ] Auth endpoints (login, verify, logout)
- [ ] Attachment serving

### UI
- [ ] Admin pages (SSR with Hono JSX)
- [ ] React chat component bundling (Vite)
- [ ] Static asset serving

### Main Application
- [ ] Main Hono app (index.ts)
- [ ] Middleware (auth, rate limiting, CORS)
- [ ] Error handling
- [ ] Logging

### Testing & Deployment
- [ ] Test hybrid search accuracy
- [ ] Test queue processing
- [ ] Local development setup guide
- [ ] Production deployment

## 🎯 Next Steps

1. **Copy existing utility code** - PDF extraction, chunking, vision analysis
2. **Implement queue consumer** - Background worker for PDF processing
3. **Build authentication system** - JWT + magic links
4. **Port API routes** - Convert Next.js API routes to Hono handlers
5. **Create admin UI** - SSR pages with Hono JSX
6. **Bundle React chat** - Vite build for client SPA
7. **Main app assembly** - Wire everything together
8. **Testing** - Verify hybrid search works, queue processing completes

## 📁 File Structure Created

```
workers/
├── src/
│   ├── types.ts                     ✅ TypeScript types
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts            ✅ Drizzle setup
│   │   │   └── schema/
│   │   │       └── d1.ts           ✅ SQLite schema
│   │   ├── ai/
│   │   │   ├── embeddings.ts       ✅ OpenAI embeddings
│   │   │   ├── vectorize.ts        ✅ Vectorize helpers
│   │   │   ├── search.ts           ✅ Hybrid search
│   │   │   └── prompt.ts           ✅ LLM prompts
│   │   ├── services/
│   │   │   └── r2-storage.ts       ✅ R2 upload/download
│   │   └── jobs/
│   │       └── status.ts           ✅ Job tracking (KV)
│   └── (pending...)
├── drizzle/
│   ├── 0001_initial.sql            ✅ Initial migration
│   └── ...
├── package.json                     ✅
├── tsconfig.json                    ✅
├── wrangler.toml                    ✅
├── drizzle.config.ts               ✅
└── README.md                        ✅ Setup instructions
```

## 🔑 Key Architectural Changes

### 1. Database: PostgreSQL → D1 (SQLite)
- No JSONB: Store JSON as TEXT, parse on read
- No arrays: Store as JSON strings
- No vector type: Use Vectorize separately
- FTS5 for full-text search instead of tsvector

### 2. Search: Single Query → Parallel Queries + Fusion
**Before:**
```sql
WITH vector_search AS (...), fts_search AS (...)
SELECT * FROM ... ORDER BY rrf_score
```

**After:**
```typescript
const [vectorResults, ftsResults] = await Promise.all([
  searchVectorize(...),  // Vectorize API
  db.prepare(fts5_query) // D1 FTS5
]);
// Application-level RRF fusion
```

### 3. Processing: Sync HTTP → Async Queue
**Before:** Upload PDF → Wait 60s → Return result

**After:** Upload PDF → Create job → Return jobId → Poll status

### 4. Storage: Vercel Blob → R2
- Similar API, different SDK
- Need to configure public access or proxy through Worker

### 5. Email: Resend → Cloudflare Email Workers
- MailChannels integration
- Free for Workers

## 💡 Important Notes

### D1 Limitations
- Max 1MB query result size (paginate large results)
- Max 25 concurrent connections
- Transaction timeout: 30s (we set 60s local timeout)
- 10GB database size limit

### Vectorize Limitations
- Max 1M vectors per index
- Metadata max 1KB per vector
- Only async operations

### Workers Limits
- CPU time: 30s (paid tier)
- Memory: 128MB
- Request size: 100MB

### FTS5 Query Syntax
- `word1 OR word2` - Match either
- `"exact phrase"` - Exact match
- `word*` - Prefix match
- `-exclude` - Exclude word

## 🚀 Setup Instructions (After Completion)

```bash
cd workers

# 1. Install dependencies
pnpm install

# 2. Create Cloudflare resources
wrangler d1 create gamegame
wrangler vectorize create gamegame-embeddings --dimensions=1536 --metric=cosine
wrangler r2 bucket create gamegame-files
wrangler kv:namespace create RATE_LIMIT
wrangler kv:namespace create JOB_STATUS
wrangler queues create resource-processing

# 3. Update wrangler.toml with IDs from above

# 4. Set secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put MISTRAL_API_KEY
wrangler secret put JWT_SECRET

# 5. Run migrations
pnpm db:migrate:local

# 6. Start dev server
pnpm dev
```
