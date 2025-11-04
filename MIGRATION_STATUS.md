# Migration Status Report
**Date**: November 3, 2025
**Migration**: Cloudflare Workers → Next.js 15

## Executive Summary

**Overall Completion: 65%**

The migration is well-architected with improved foundations (type safety, testing, better infrastructure) but has **4 critical blocking issues** that prevent the application from functioning.

---

## Critical Blocking Issues

### 🔴 BLOCKER #1: Missing `resource-processor.ts` Module
- **File**: `nextjs/lib/services/resource-processor.ts`
- **Status**: DOES NOT EXIST
- **Impact**: Application crashes on PDF upload
- **Missing Functions**:
  - `uploadResourceImages()` - Upload PDF images to blob storage
  - `processResourceContent()` - Generate fragments and embeddings
  - `calculateResourceStats()` - Calculate pageCount, wordCount, imageCount
  - `cleanupBlobsOnError()` - Delete orphaned blobs on failure
- **Location**: Imported in `lib/actions/resources.ts:20`
- **Effort**: 4-6 hours to port from Workers

### 🔴 BLOCKER #2: Missing `answerTypes` Column
- **Table**: `fragments`
- **Status**: Exists in D1 (Workers), NOT in PostgreSQL (Next.js)
- **Impact**: Data loss when migrating from Workers database
- **Fix**: `ALTER TABLE fragments ADD COLUMN answer_types jsonb;`
- **Effort**: 5 minutes + migration file

### 🔴 BLOCKER #3: No Public User Interface
- **Missing Pages**:
  - `/` - Home page
  - `/games` - Game listing
  - `/games/:gameId` - **Chat interface (CORE FEATURE)** - 429 lines to port
  - `/login` and `/login/verify` - Authentication pages
- **Impact**: Application is admin-only, unusable by end users
- **Effort**: 2-3 days

### 🔴 BLOCKER #4: Missing Chat API Endpoint
- **Endpoint**: `POST /api/games/:gameId/chat`
- **Status**: Not implemented
- **Impact**: Chat functionality completely broken
- **Requirements**:
  - Streaming with streamText()
  - RAG tools (getKnowledge, getAttachment)
  - Rate limiting
- **Effort**: 3-4 hours

---

## Component-by-Component Status

### ✅ API Routes - 95% Complete
**Status**: Nearly complete, excellent test coverage

**Migrated** (9 endpoints):
- ✅ `/api/auth/[...nextauth]` - NextAuth authentication
- ✅ `/api/games` (GET/POST) - Games list and creation
- ✅ `/api/games/[gameIdOrSlug]` (GET/PATCH/DELETE) - Game CRUD
- ✅ `/api/games/[gameIdOrSlug]/resources` (GET/POST) - Game resources
- ✅ `/api/resources/[resourceId]` (GET/PATCH/DELETE) - Resource CRUD
- ✅ `/api/upload` - Unified file upload (consolidated from 2 endpoints)
- ✅ `/api/health` - Health check

**New Endpoints Added** (8 endpoints):
- ✅ `/api/attachments/[attachmentId]` - Attachment CRUD
- ✅ `/api/resources/[resourceId]/attachments` - Resource attachments
- ✅ `/api/games/[gameIdOrSlug]/attachments` - Game attachments
- ✅ `/api/bgg/search` - Search BoardGameGeek
- ✅ `/api/bgg/games/[bggId]` - Get BGG game details
- ✅ `/api/bgg/games/[bggId]/import` - Import from BGG
- ✅ `/api/bgg/extract-id` - Extract BGG ID from URL
- ✅ `/api/workflows/process-resource` - Background job processing

**Missing**:
- ❌ `/api/games/:gameId/chat` (POST) - **CRITICAL** - streaming chat endpoint

**Test Coverage**: 53/53 tests passing ✅

**Key Improvements**:
- Type safety with Drizzle ORM + Zod validation
- Comprehensive test suite
- Better error handling
- Slug-based lookups
- BGG integration

---

### ⚠️ Database Schema - 95% Complete
**Status**: Well-migrated with one critical missing column

**Migrated Tables** (9):
- ✅ `games` - All 9 columns
- ✅ `resources` - All 16 columns (storage abstracted R2→Blob)
- ✅ `attachments` - All 15 columns
- ✅ `users` - All 5 columns
- ✅ `bgg_games` - All 13 columns (cache for BGG API)
- ✅ `accounts` - NextAuth v5 (NEW)
- ✅ `sessions` - NextAuth v5 (NEW)
- ✅ `verification_tokens` - NextAuth v5 (NEW)
- ✅ `jobs` - Background job tracking (NEW, replaces KV)

**Partial Migration** (1):
- ⚠️ `fragments` - Missing `answer_types` column (exists in D1)

**New Tables** (2):
- ✅ `embeddings` - Vector embeddings (migrated from Cloudflare Vectorize)
- ✅ `jobs` - Job queue (replacing KV storage)

**Critical Issues**:
- ❌ Missing `answer_types` column - **data loss risk**
- ⚠️ Vector regeneration needed (Vectorize format incompatible with pgvector)
- ⚠️ FTS recomputation needed (SQLite FTS5 → PostgreSQL tsvector)

**Architectural Changes**:
- D1 (SQLite) → PostgreSQL
- Cloudflare Vectorize → pgvector extension
- SQLite FTS5 → PostgreSQL tsvector + GIN index
- Cloudflare KV → PostgreSQL jobs table
- R2 storage → Vercel Blob (abstracted via `blobKey`)
- Custom JWT auth → NextAuth v5

---

### ⚠️ Service Layer - 85% Complete
**Status**: Core services migrated, missing 2 services

**Fully Migrated** (16 services):
- ✅ BGG integration (with WebP image optimization improvement)
- ✅ PDF extraction & processing (Mistral OCR)
- ✅ Text chunking & splitter
- ✅ Markdown cleanup
- ✅ Vision/image analysis
- ✅ HyDE embeddings generation
- ✅ Searchable content processing
- ✅ Resource metadata generation
- ✅ Hybrid search (with LLM cross-encoder reranking upgrade)
- ✅ Embeddings
- ✅ Rate limiting (Workers KV → Vercel KV)
- ✅ Storage (R2 → Vercel Blob + local dev fallback)
- ✅ Image processing (Sharp WebP conversion)
- ✅ Chunking service
- ✅ Vision enrichment
- ✅ Markdown cleanup

**Missing Services** (2):
- ❌ Email service (for password resets, invitations) - **CRITICAL**
- ❌ Answer type classification - Medium priority

**Partially Migrated** (1):
- ⚠️ Prompt & Tools - Integrated into API routes instead of separate testable modules

**Key Improvements**:
- Storage: R2 → Vercel Blob + local filesystem fallback (better dev experience)
- Queue: Workers Queue → Vercel Workflows (durable execution, auto-retry)
- Vector DB: Vectorize → pgvector (simpler, standard)
- Search: RRF → Cross-encoder LLM reranking (better relevance)
- Images: Sharp WebP conversion (optimized assets)

---

### ❌ Processing Pipeline - 45% Complete
**Status**: BROKEN - Missing critical module and architectural issues

**Fully Migrated**:
- ✅ Upload endpoint
- ✅ PDF extraction (Mistral OCR)
- ✅ Image handling logic
- ✅ Chunking (2500 chars, 200 overlap)
- ✅ Embedding generation (OpenAI text-embedding-3-small, 1536 dims)
- ✅ Database storage (PostgreSQL transactions)
- ✅ Vercel Workflows infrastructure (6 stages: INGEST, VISION, CLEANUP, METADATA, EMBED, FINALIZE)

**Critical Issues**:
1. ❌ **Missing `resource-processor.ts` module** - BLOCKING
   - File doesn't exist: `nextjs/lib/services/resource-processor.ts`
   - 4 functions imported but undefined
   - Application will crash on first PDF upload

2. ❌ **Synchronous Processing** - HIGH SEVERITY
   - `createResource()` processes entire PDF in single HTTP request
   - Will timeout on PDFs >5MB
   - Workers properly uses async queue with resumable stages
   - Timeouts at 60-300 seconds depending on deployment

3. ❌ **Missing HyDE Question Generation** - MEDIUM SEVERITY
   - Workers generates hypothetical questions for each chunk
   - Improves semantic search quality
   - Completely removed in Next.js

4. ❌ **No Stalled Job Cleanup** - MEDIUM SEVERITY
   - Workers has periodic cleanup of stuck jobs
   - Next.js has no equivalent
   - Orphaned jobs will accumulate

5. ⚠️ **Embedding Version Mismatch**
   - Workers: v5 (with answer type classification)
   - Next.js: v4 (chunk size increase only)
   - Will cause inconsistent search results

**Processing Model Comparison**:

| Aspect | Workers | Next.js |
|--------|---------|---------|
| Initial Upload | Queued to RESOURCE_QUEUE | **Synchronous in handler** |
| Vision Analysis | Async stage (minutes OK) | **Synchronous (timeouts)** |
| Embedding | Async with retry | **Inside DB transaction** |
| Timeout Risk | Can retry indefinitely | **60-300s hard limit** |
| Max PDF Size | Large PDFs OK | **Limited by timeout** |

---

### ❌ UI Components - 40% Complete
**Status**: Admin complete, public interface missing

**Fully Migrated - Admin** (100%):
- ✅ `/admin` - Game list
- ✅ `/admin/add-game` - Add game form (with BGG search)
- ✅ `/admin/games/:id` - Game detail
- ✅ `/admin/games/:id/:rid` - Resource detail with attachments
- ✅ Game list component
- ✅ Game form
- ✅ Resource list
- ✅ Add game form
- ✅ Attachment list

**Core Components Migrated**:
- ✅ Layout, Header, Footer
- ✅ Heading
- ✅ FlashMessages
- ✅ ResourceDropzone
- ✅ ProcessingProvider

**UI Library** (Radix UI + Tailwind):
- ✅ Button, Input, Label, Textarea
- ✅ Card, Table
- ❌ Badge, Tabs, Tooltip, Spinner, Toast

**Missing - Public Interface** (0%):
- ❌ `/` - Home page
- ❌ `/games` - Game listing
- ❌ **`/games/:gameId` - Chat interface** - **CORE FEATURE** - 429 lines to port
- ❌ `/login`, `/login/verify` - Authentication pages

**Missing Components**:
- ❌ Chat component (429 lines in Workers app)
- ❌ Game list (public)
- ❌ Landing page
- ❌ Login form

**Impact**: Application is completely inaccessible to end users

---

### ✅ Configuration & Environment - 100% Complete
**Status**: Fully migrated with comprehensive improvements

**Environment Variables**:
- ✅ All migrated from `wrangler.toml` → `.env` + `env.mjs`
- ✅ Type-safe validation with Zod (@t3-oss/env-nextjs)
- ✅ Comprehensive error messages

**Key Changes**:
- `JWT_SECRET` → `AUTH_SECRET` (NextAuth)
- `RESEND_API_KEY` → `AUTH_RESEND_KEY`
- D1 bindings → `DATABASE_URL` (PostgreSQL)
- R2 bindings → `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
- Vectorize binding → pgvector extension
- KV bindings → Vercel KV env vars (optional)

**Infrastructure Migration**:
- Cloudflare D1 → PostgreSQL
- Cloudflare R2 → Vercel Blob (+ local fallback)
- Cloudflare Vectorize → pgvector
- Cloudflare KV → Vercel KV (optional)
- Cloudflare Queues → Vercel Workflows
- Custom JWT → NextAuth v5

**Build & Deploy**:
- `wrangler deploy` → Git-push to Vercel
- React Router → Next.js App Router
- Concurrent dev servers → Single Next.js dev server with Turbopack
- React 18 → React 19 with React Compiler

---

## Architectural Improvements

Despite incompleteness, the Next.js app has better foundations:

1. **Type Safety**: Drizzle ORM + Zod validation throughout
2. **Test Coverage**: 53 automated API tests (all passing)
3. **Better Storage**: Vercel Blob with local filesystem fallback
4. **Better Workflows**: Vercel Workflows vs Cloudflare Queues (cleaner, auto-retry)
5. **Better Search**: Cross-encoder LLM reranking vs basic RRF
6. **Better Images**: Sharp WebP conversion for optimized assets
7. **Better Auth**: NextAuth v5 (standardized) vs custom JWT
8. **Better Database**: PostgreSQL ACID transactions vs SQLite limitations
9. **Better Framework**: Next.js 15 with App Router, Turbopack, React Compiler
10. **Better DX**: Single dev server, better error messages, type-safe env

---

## Priority Action Items

### 🔴 PRIORITY 1: Fix Blocking Issues ~~(2-3 days)~~ ✅ COMPLETED

1. ✅ **Create `resource-processor.ts`** with 4 missing functions
   - Created: `/Users/dcramer/src/gamegame/nextjs/lib/services/resource-processor.ts`
   - Functions: uploadResourceImages, processResourceContent, calculateResourceStats, cleanupBlobsOnError
   - Status: Complete and functional

2. ✅ **Add `answerTypes` column to fragments table**
   - Created migration: `drizzle/0002_yummy_black_crow.sql`
   - Updated schema: `lib/db/schema/fragments.ts`
   - Status: Migration ready to run with `pnpm db:migrate`

3. ✅ **Build public user interface**
   - Created 12 files, 1,442 lines of code
   - Pages: Home (redirects to /games), Games list with search, Game chat page
   - Auth: Sign in, verify, error pages
   - Components: Chat component (606 lines) with full streaming support
   - Custom hook: useAgentChat for SSE streaming
   - Status: Complete and ready to test

4. ✅ **Implement `/api/games/:gameId/chat` endpoint**
   - Created: `app/api/games/[gameIdOrSlug]/chat/route.ts`
   - RAG infrastructure: `lib/ai/prompt.ts`, `lib/ai/tools.ts`
   - Tools: search_resources, search_media, list_resources, get_attachment
   - Streaming: Uses Vercel AI SDK's streamText()
   - Status: Complete and ready to test

### 🟡 PRIORITY 2: Fix Architecture Issues (2-3 days)

5. **Move PDF processing to async**
   - Change `createResource()` to trigger Vercel Workflow immediately
   - Don't process synchronously in HTTP handler
   - Effort: 4-6 hours

6. **Implement HyDE question generation**
   - Port from Workers EMBED stage
   - Generates hypothetical questions for better search
   - Effort: 3-4 hours

7. **Fix embedding version mismatch**
   - Update `CURRENT_INDEX_VERSION` from 4 → 5
   - Re-embed all resources
   - Effort: 2 hours + background processing

8. **Add missing utility components**
   - Badge, Tabs, Tooltip, Spinner
   - Effort: 2-3 hours

### 🟢 PRIORITY 3: Polish & Enhancement (1-2 days)

9. **Stalled job cleanup background task**
   - Periodic check for jobs stuck in 'processing' >1 hour
   - Mark as failed
   - Effort: 2-3 hours

10. **Email notification service**
    - Port from Workers: `workers/src/lib/services/email.ts`
    - Functions: sendPasswordResetEmail, sendInvitationEmail, sendNotificationEmail
    - Effort: 3-4 hours

11. **Answer type classification enrichment**
    - Port from Workers: `workers/src/lib/services/answer-type-classification.ts`
    - Enriches search with question type classification
    - Effort: 4-6 hours

12. **E2E testing for full user flows**
    - Upload PDF → ask questions → get answers
    - Effort: 1 day

---

## Migration Scorecard

| Component | Status | Score | Blockers |
|-----------|--------|-------|----------|
| **API Routes** | ⚠️ Partial | 95% | Chat endpoint missing |
| **Database Schema** | ⚠️ Partial | 95% | answerTypes column missing |
| **Service Layer** | ⚠️ Partial | 85% | Email, answer classification |
| **Processing Pipeline** | ❌ Broken | 45% | resource-processor.ts missing |
| **UI Components** | ❌ Broken | 40% | Chat, public pages missing |
| **Configuration** | ✅ Complete | 100% | None |
| **Overall** | ⚠️ Partial | **65%** | 4 critical blockers |

---

## Recommendation

**The migration is well-architected but incomplete.** The new Next.js app has significantly better foundations (type safety, testing, infrastructure), but lacks critical user-facing features.

**Before this can go to production:**
1. Fix the 4 blocking issues (resource-processor, answerTypes, chat UI, chat API)
2. Test end-to-end user flows (upload PDF → ask questions → get answers)
3. Re-embed all resources with correct version
4. Move to async processing to handle large PDFs

**Estimated time to production-ready: 5-8 days of focused work**

**Next Steps**: Work through blockers systematically in priority order.

---

## File Locations Reference

### Critical Missing Files
- `nextjs/lib/services/resource-processor.ts` - DOES NOT EXIST (blocking)

### Key Implementation Files

**Workers App (Source)**:
- `/Users/dcramer/src/gamegame/workers/src/routes/api/upload.ts`
- `/Users/dcramer/src/gamegame/workers/src/routes/api/resources.ts`
- `/Users/dcramer/src/gamegame/workers/src/lib/processing/pdf-processor.ts` (1297 lines)
- `/Users/dcramer/src/gamegame/workers/src/workers/resource-processor.ts`
- `/Users/dcramer/src/gamegame/workers/src/lib/services/`
- `/Users/dcramer/src/gamegame/workers/src/components/Chat.tsx` (429 lines)

**Next.js App (Target)**:
- `/Users/dcramer/src/gamegame/nextjs/app/api/upload/route.ts`
- `/Users/dcramer/src/gamegame/nextjs/lib/actions/resources.ts`
- `/Users/dcramer/src/gamegame/nextjs/lib/workflows/process-resource.ts` (797 lines)
- `/Users/dcramer/src/gamegame/nextjs/lib/services/`
- `/Users/dcramer/src/gamegame/nextjs/app/` (pages)

### Configuration
- `/Users/dcramer/src/gamegame/nextjs/lib/env.mjs` - Environment validation
- `/Users/dcramer/src/gamegame/nextjs/next.config.ts` - Next.js config
- `/Users/dcramer/src/gamegame/nextjs/drizzle.config.ts` - Database config
- `/Users/dcramer/src/gamegame/nextjs/lib/db/schema/` - Schema definitions
- `/Users/dcramer/src/gamegame/nextjs/lib/db/migrations/` - SQL migrations
