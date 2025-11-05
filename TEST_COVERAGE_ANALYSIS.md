# Test Coverage Analysis

## API Routes Coverage

### ✅ Tested API Routes (12/23)

1. **Health Check**
   - Route: `/api/health/route.ts`
   - Test: `tests/api/health.test.ts`

2. **Games**
   - Route: `/api/games/route.ts` (GET, POST)
   - Route: `/api/games/[gameIdOrSlug]/route.ts` (GET, PUT, DELETE)
   - Test: `tests/api/games.test.ts`

3. **Game Resources**
   - Route: `/api/games/[gameIdOrSlug]/resources/route.ts` (GET, POST)
   - Test: `tests/api/games/resources.test.ts`

4. **Game Attachments**
   - Route: `/api/games/[gameIdOrSlug]/attachments/route.ts` (GET)
   - Test: `tests/api/games/attachments.test.ts`

5. **Resources**
   - Route: `/api/resources/[resourceId]/route.ts` (GET, PUT, DELETE)
   - Test: `tests/api/resources/resource.test.ts`

6. **Resource Attachments**
   - Route: `/api/resources/[resourceId]/attachments/route.ts` (GET)
   - Test: `tests/api/resources/attachments.test.ts`

7. **Attachments**
   - Route: `/api/attachments/[attachmentId]/route.ts` (GET, PUT)
   - Test: `tests/api/attachments.test.ts`

8. **BGG Integration**
   - Route: `/api/bgg/extract-id/route.ts` (POST)
   - Route: `/api/bgg/search/route.ts` (GET)
   - Route: `/api/bgg/games/[bggId]/route.ts` (GET)
   - Route: `/api/bgg/games/[bggId]/import/route.ts` (POST)
   - Test: `tests/api/bgg.test.ts`

9. **Upload**
   - Route: `/api/upload/route.ts` (POST)
   - Test: `tests/api/upload.test.ts`

### ❌ Untested API Routes (11/23) - HIGH PRIORITY

1. **Chat** ⚠️ CRITICAL - Main user-facing feature
   - Route: `/api/games/[gameIdOrSlug]/chat/route.ts` (POST)
   - Missing: `tests/api/games/chat.test.ts`
   - Should test:
     - Message sending
     - Streaming responses
     - Tool calls (getKnowledge, listResources, getAttachment)
     - Error handling
     - Rate limiting

2. **Authentication** ⚠️ CRITICAL - Security
   - Route: `/api/auth/verify/route.ts` (POST)
   - Missing: `tests/api/auth/verify.test.ts`
   - Should test:
     - Token verification
     - Session creation
     - Invalid tokens
     - Expired tokens

3. **Resource Upload** ⚠️ HIGH - Just created
   - Route: `/api/resources/upload/route.ts` (POST)
   - Missing: `tests/api/resources/upload.test.ts`
   - Should test:
     - Development mode formData upload
     - Production mode Vercel Blob validation
     - File type validation (PDF only)
     - Admin authentication
     - File size limits

4. **Image Upload** ⚠️ HIGH - Just created
   - Route: `/api/images/upload/route.ts` (POST)
   - Missing: `tests/api/images/upload.test.ts`
   - Should test:
     - Development mode formData upload
     - Production mode Vercel Blob validation
     - Image type validation
     - Admin authentication
     - File size limits

5. **Workflow: Process Resource** ⚠️ HIGH - Core functionality
   - Route: `/api/workflows/process-resource/route.ts` (POST, GET)
   - Missing: `tests/api/workflows/process-resource.test.ts`
   - Should test:
     - Job creation
     - Workflow triggering
     - Status checking (GET)
     - fromStage parameter
     - Authentication (admin + cron)

6. **Jobs Management** - Admin features
   - Route: `/api/admin/jobs/route.ts` (GET)
   - Route: `/api/admin/jobs/[jobId]/cancel/route.ts` (POST)
   - Route: `/api/admin/jobs/[jobId]/retry/route.ts` (POST)
   - Missing: `tests/api/admin/jobs.test.ts`
   - Should test:
     - List jobs with filters
     - Cancel running job
     - Retry failed job
     - Admin authentication

7. **Attachment Reprocessing**
   - Route: `/api/attachments/[attachmentId]/reprocess/route.ts` (POST)
   - Missing: `tests/api/attachments/reprocess.test.ts`
   - Should test:
     - Vision analysis re-run
     - Admin authentication

8. **Workflow: Cleanup Stalled Jobs** - Cron job
   - Route: `/api/workflows/cleanup-stalled-jobs/route.ts` (POST, GET)
   - Missing: `tests/api/workflows/cleanup-stalled-jobs.test.ts`
   - Should test:
     - Cron authentication (CRON_SECRET)
     - Admin authentication fallback
     - Job detection logic
     - Status checking

9. **Workflow: Cleanup Orphaned Blobs** - Cron job
   - Route: `/api/workflows/cleanup-orphaned-blobs/route.ts` (POST, GET)
   - Missing: `tests/api/workflows/cleanup-orphaned-blobs.test.ts`
   - Should test:
     - Cron authentication (CRON_SECRET)
     - Admin authentication fallback
     - Blob detection logic
     - Status checking

## Server Actions Coverage

### ✅ Tested Actions

None explicitly tested yet - actions are tested indirectly through API route tests

### ❌ Untested Actions (5 files)

1. **lib/actions/games.ts**
   - `createGame()`, `updateGame()`, `deleteGame()`, `getGame()`
   - Currently tested indirectly via API tests
   - Should have: `lib/actions/games.test.ts`

2. **lib/actions/resources.ts** ⚠️ CRITICAL
   - `createResource()`, `updateResource()`, `deleteResource()`, `reprocessResource()`
   - Complex workflow triggering logic
   - Should have: `lib/actions/resources.test.ts`

3. **lib/actions/attachments.ts**
   - `reprocessAttachment()`, attachment queries
   - Should have: `lib/actions/attachments.test.ts`

4. **lib/actions/bgg.ts**
   - `searchBGG()`, `fetchBGGGame()`, `createGameFromBGG()`
   - Currently tested via API tests
   - Should have: `lib/actions/bgg.test.ts`

5. **lib/actions/forms.ts**
   - Form utilities
   - Should have: `lib/actions/forms.test.ts`

## Service Layer Coverage

### ✅ Tested Services (7/15)

1. `lib/services/bgg.ts` → `lib/services/bgg.test.ts`
2. `lib/services/searchable-content.ts` → `lib/services/searchable-content.test.ts`
3. `lib/services/image-analysis.ts` → `lib/services/image-analysis.test.ts`
4. `lib/services/blob-storage.ts` → `lib/services/blob-storage.test.ts`
5. `lib/services/hyde.ts` → `lib/services/hyde.test.ts`
6. `lib/services/answer-type-classification.ts` → `lib/services/answer-type-classification.test.ts`
7. `lib/services/rate-limit.ts` → `lib/services/rate-limit.test.ts`

### ❌ Untested Services (8/15)

1. **lib/services/images.ts** ⚠️ HIGH
   - `uploadImages()`, `deleteImages()`, `convertToWebP()`
   - Critical for resource processing

2. **lib/services/resource-processor.ts** ⚠️ HIGH
   - `uploadResourceImages()`, `processResourceContent()`, `calculateResourceStats()`
   - Core resource processing logic

3. **lib/services/resource-metadata.ts**
   - PDF metadata extraction

4. **lib/services/text-splitter.ts**
   - Custom text splitting logic

5. **lib/services/markdown-cleanup.ts**
   - Markdown post-processing

6. **lib/services/chunking.ts** ⚠️ CRITICAL
   - Smart chunking with page/section preservation
   - Complex logic that needs thorough testing

7. **lib/services/vision.ts** (if exists)
   - Vision API integration

8. **lib/utils/rate-limit-handler.ts**
   - Rate limiting middleware

## AI Layer Coverage

### ✅ Tested (2/4)

1. `lib/ai/embeddings.ts` → `lib/ai/embeddings.test.ts`
2. `lib/ai/search.ts` → `lib/ai/search.test.ts`

### ❌ Untested (2/4)

1. **lib/ai/prompt.ts** ⚠️ CRITICAL
   - System prompt building
   - Tool definitions
   - Response parsing
   - Should test LLM behavior with different prompts

2. **lib/ai/tools.ts** ⚠️ HIGH
   - `getKnowledge()`, `listResources()`, `getAttachment()`
   - Tool execution logic

## Workflow Coverage

### ✅ Tested Workflows (2/3)

1. `lib/workflows/cleanup-stalled-jobs/index.ts` → `lib/workflows/cleanup-stalled-jobs.test.ts`
2. `lib/workflows/cleanup-orphaned-blobs/index.ts` → `lib/workflows/cleanup-orphaned-blobs.test.ts`

### ❌ Untested Workflows (1/3)

1. **lib/workflows/process-resource/** ⚠️ CRITICAL
   - Missing: `lib/workflows/process-resource/index.test.ts`
   - Should test:
     - Full workflow execution
     - Step-by-step progression
     - fromStage resumption
     - Error handling and job status updates
   - Missing step tests:
     - `steps/ingest.test.ts`
     - `steps/vision.test.ts`
     - `steps/cleanup.test.ts`
     - `steps/metadata.test.ts`
     - `steps/embed.test.ts`
     - `steps/finalize.test.ts`

## Other Missing Tests

1. **lib/pdf.ts** - ✅ HAS TEST
2. **lib/logger.ts** - No test (low priority, mostly logging)
3. **lib/env.mjs** - No test (env validation, low priority)
4. **lib/session.ts** - ❌ No test ⚠️ HIGH PRIORITY (auth logic)

## Test Priority Matrix

### P0 - Critical (Must have before production)

1. `/api/games/[gameIdOrSlug]/chat/route.ts` - Main user feature
2. `/api/auth/verify/route.ts` - Security
3. `lib/actions/resources.ts` - Core functionality
4. `lib/workflows/process-resource/` - Core functionality
5. `lib/services/chunking.ts` - Data quality
6. `lib/ai/prompt.ts` - LLM behavior

### P1 - High Priority (Should have soon)

1. `/api/resources/upload/route.ts` - Just created
2. `/api/images/upload/route.ts` - Just created
3. `/api/workflows/process-resource/route.ts` - Core API
4. `lib/services/images.ts` - File handling
5. `lib/services/resource-processor.ts` - Core processing
6. `lib/ai/tools.ts` - LLM integration
7. `lib/session.ts` - Auth logic

### P2 - Medium Priority (Nice to have)

1. `/api/admin/jobs/*.ts` - Admin features
2. `/api/attachments/[attachmentId]/reprocess/route.ts` - Admin feature
3. Workflow cron endpoints - Background jobs
4. Server actions tests - Currently covered indirectly
5. Other service tests

## Coverage Summary

- **API Routes**: 12/23 tested (52%)
- **Server Actions**: 0/5 tested directly (0%)
- **Services**: 7/15 tested (47%)
- **AI Layer**: 2/4 tested (50%)
- **Workflows**: 2/3 tested (67%)
- **Overall**: ~35% code path coverage (estimated)

## Recommended Test Writing Order

1. Chat API + AI tools + prompt building (user-facing)
2. Resource upload endpoints + actions (data ingestion)
3. Process resource workflow + steps (core pipeline)
4. Auth verification (security)
5. Chunking service (data quality)
6. Image services + resource processor (supporting services)
7. Admin job management (admin tools)
8. Workflow cron endpoints (background maintenance)
9. Session/auth utilities (security utilities)
10. Remaining services
