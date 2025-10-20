# Architecture Review - Action Items

Generated: 2025-10-13

## Critical Issues (Fix Immediately)

### 1. Database Connection Pool Misconfiguration for Serverless
**File:** `lib/db/index.ts:6`
**Problem:** Using `node-postgres` Pool in serverless environment causes connection leaks. Each function creates new pool but connections aren't closed on termination.
**Impact:** Database connection exhaustion under load
**Fix:** Configure pool for serverless (max: 1) or switch to `@vercel/postgres`

### 2. Chat API Route Has No Authentication
**File:** `app/api/games/[gameId]/chat/route.ts`
**Problem:** Chat endpoint only has rate limiting, no auth check. Anyone can query any game.
**Impact:** Unauthorized access to all content, API cost exposure
**Fix:** Add authentication check or document as intentionally public

### 3. Auth Callback Missing Return Statement
**File:** `auth.ts:27-35`
**Problem:** `authorized` callback doesn't return `true` for authorized requests
**Impact:** Undefined behavior - may block legitimate requests
**Fix:** Add explicit `return true` for authorized cases

### 4. No Database Transaction Timeout
**Problem:** Transactions in resource processing have no timeout
**Impact:** Database deadlocks, blocked queries, failed deployments
**Fix:** Add `SET LOCAL statement_timeout = '30s'` to transactions

## High Priority Issues

### 5. BGG In-Memory Cache Won't Survive Serverless Restarts
**File:** `lib/services/bgg.ts:32-36`
**Problem:** BGG uses `Map()` for caching which resets on cold start
**Impact:** Repeated API calls, rate limit violations, slow performance
**Fix:** Remove in-memory cache, rely on `bgg_games` table

### 6. Legacy Image Upload Pattern Creates Orphaned Records ✅ REMOVED
**File:** ~~`lib/services/images.ts:118-186`~~
**Problem:** `storePDFImage()` creates DB record first, then uploads. Upload failure leaves orphaned records
**Impact:** Database pollution, broken references
**Resolution:** Removed legacy `storePDFImage` and `storePDFImages` functions. All code now uses the correct `uploadPDFImageToBlob` + `createAttachmentRecord` pattern.

### 7. No Retry Logic for External API Calls ✅ IMPLEMENTED
**Problem:** Mistral OCR, OpenAI embeddings, BGG API have no retry for transient failures
**Impact:** Permanent failures on temporary network issues
**Resolution:** Implemented comprehensive retry logic with exponential backoff:
  - Created `lib/retry.ts`: Reusable retry wrapper with configurable options
  - Default behavior: 3 retries, exponential backoff (1s, 2s, 4s up to 10s max)
  - Automatic retry for network errors, 5xx server errors, and 429 rate limits
  - Applied to:
    - Mistral OCR API calls (`lib/pdf.ts`): 3 retries, 2s initial delay
    - OpenAI embedding calls (`lib/ai/search.ts`): 3 retries for both embedMany and embed
    - BGG API calls (`lib/services/bgg.ts`): 2 retries for search, game details, and image fetching (BGG is rate-limited)
  - Structured logging for all retry attempts with context

### 8. BGG Request Queue State Lost on Restart ✅ FIXED
**File:** `lib/services/bgg.ts:11-110`
**Problem:** `BGGRequestQueue` is in-memory, `lastRequestTime` resets on restart
**Impact:** May violate BGG's 5-second rate limit
**Resolution:** Implemented distributed rate limiting using Vercel KV:
  - Uses Redis SET NX with 5-second expiry as a distributed lock
  - Only one serverless instance can make a BGG request every 5 seconds (across all instances)
  - Automatically retries lock acquisition with 1-second intervals
  - Maximum wait time of 30 seconds before falling back to in-memory
  - Gracefully falls back to in-memory rate limiting if KV is unavailable (development)
  - Comprehensive structured logging for lock acquisition, waits, and fallbacks

### 9. Migration Script Doesn't Close Connection
**File:** `lib/db/migrate.ts:23`
**Problem:** Calls `process.exit(0)` without closing postgres connection
**Impact:** Process hangs waiting for connection to close
**Fix:** Add `await connection.end()` before exit

### 10. FauxRateLimiter in Development Masks Issues
**File:** `lib/ratelimiter.ts:5-13`
**Problem:** Development uses no-op rate limiter, bugs only appear in production
**Impact:** Production-only bugs
**Fix:** Use real in-memory rate limiter for development

## Medium Priority Issues

### 11. updatedAt Not Automatically Updated ✅ FIXED
**Files:** `lib/db/schema/games.ts:21`, `lib/db/schema/resources.ts:50`
**Problem:** `updatedAt` has `DEFAULT now()` but no update trigger
**Impact:** Inaccurate modification tracking
**Resolution:** Added `.$onUpdate(() => new Date())` to both `games` and `resources` tables. Timestamps now automatically update on every update operation.

### 12. Search Uses Raw SQL Instead of Query Builder
**File:** `lib/ai/search.ts:141-204`
**Problem:** Hybrid search is raw SQL, losing type safety
**Impact:** Maintenance burden, potential type mismatches
**Note:** May be necessary for complex RRF query - ensure comprehensive tests

### 13. No Pagination on Search Results ✅ ADDED
**File:** `lib/ai/search.ts:135-230`
**Problem:** Fixed limit of 10 results, no pagination
**Impact:** Can't retrieve more context when needed
**Resolution:** Added optional `options` parameter with `limit` and `offset` fields:
  - `limit`: Number of results to return (default: 10)
  - `offset`: Number of results to skip (default: 0)
  - Properly handles RRF fusion by fetching `(limit + offset) * 2` candidates from each CTE
  - Backward compatible - existing calls work without changes

### 14. Fixed Batch Size May Cause Timeouts ✅ FIXED
**File:** `lib/services/resource-processor.ts:161`
**Problem:** `BATCH_SIZE = 100` for fragment insertion, may timeout on large PDFs
**Impact:** Failed processing for large documents
**Resolution:** Made batch size configurable via environment variable:
  - Added `FRAGMENT_BATCH_SIZE` to `lib/env.mjs` (default: 100, range: 10-500)
  - Updated `insertFragments()` to use configurable batch size
  - Added structured logging for batch progress (batch N/total)
  - Users can now set smaller batch sizes for very large PDFs to avoid transaction timeouts

### 15. No Validation of Embedding Dimensions
**File:** `lib/ai/search.ts`
**Problem:** No validation that embeddings are 1536 dimensions before DB insert
**Impact:** Cryptic failures if wrong model used
**Fix:** Add dimension validation

### 16. Image Format Detection Defaults to JPEG ✅ FIXED
**File:** `lib/services/images.ts:14-46`
**Problem:** Unrecognized formats default to JPEG silently
**Impact:** Misnamed files, rendering issues
**Resolution:** Now throws descriptive error with magic bytes for unrecognized formats and invalid buffers. Supports JPEG, PNG, GIF, WebP.

### 17. getAttachment Tool Doesn't Handle Missing Attachments
**File:** `lib/ai/prompt.ts:49-59`
**Problem:** Missing attachments throw, crashing AI response
**Impact:** Failed AI responses when referencing deleted attachments
**Fix:** Return error object instead of throwing

## Low Priority Issues

### 18. No Structured Logging ✅ IMPLEMENTED
**Problem:** Uses `console.log/warn/error` throughout
**Impact:** Difficult to debug production, no log aggregation
**Resolution:** Implemented Pino-based structured logging with:
  - `lib/logger.ts`: Core logger with Pino, pretty-printing in dev, JSON in production
  - Sensitive data redaction (passwords, tokens, API keys, etc.)
  - Context-aware child loggers with operation metadata
  - Performance timing utilities (`logTiming()`)
  - Error serialization with stack traces
  - Comprehensive logging added to:
    - `lib/actions/resources.ts`: Resource processing, reprocessing, updates, deletes
    - `lib/pdf.ts`: PDF extraction with Mistral OCR, timing for API calls and cleanup
    - `lib/services/bgg.ts`: BGG API calls, rate limiting, database caching, image conversion
    - `lib/services/images.ts`: Blob uploads, deletions, format detection
    - `lib/services/resource-processor.ts`: Fragment insertion, blob cleanup
    - `lib/ratelimiter.ts`: Rate limiter initialization warnings
    - `lib/actions/bgg.ts`: BGG search, fetch, game creation
    - `lib/actions/games.ts`: Game updates, deletions, blob cleanup
    - `lib/services/markdown-cleanup.ts`: Markdown processing, content reduction warnings
  - All `console.*` statements replaced with structured logging across the entire `lib/` directory

### 19. MODEL Constant Hard-Coded
**File:** `constants.ts:3`
**Problem:** Hard-coded model name, not environment-configurable
**Impact:** Can't A/B test or switch models per environment
**Fix:** Move to env.mjs with default

### 20. No Health Check Endpoint ✅ ADDED
**File:** `app/api/health/route.ts`
**Problem:** No `/api/health` for monitoring
**Impact:** Can't monitor availability, difficult to debug deployments
**Resolution:** Added health check endpoint that verifies:
  - Database connectivity (SELECT 1)
  - Required environment variables (DATABASE_URL, OPENAI_API_KEY, MISTRAL_API_KEY, AUTH_SECRET, AUTH_RESEND_KEY)
  - pgvector extension availability
  - Returns 200 OK if healthy, 503 Service Unavailable if any check fails

### 21. No Collision Detection for nanoid
**Problem:** No uniqueness validation for nanoid IDs
**Impact:** Extremely low probability, but collisions would corrupt data
**Note:** Likely acceptable - consider DB unique constraint as safety net

### 22. URL Validation Doesn't Check Accessibility
**File:** `lib/db/schema/resources.ts:62-74`
**Problem:** Only validates URL format, not accessibility
**Impact:** Processing fails later with cryptic error
**Fix:** Better error messaging during processing

## Deployment Concerns

### 23. Manual Migration Requirement
**Problem:** Migrations don't auto-apply in production
**Impact:** Deployment complexity, schema/code mismatch risk
**Recommendation:** Add migration check to startup or Vercel build step

### 24. No Rollback Strategy
**Problem:** No documented rollback for failed migrations
**Impact:** Extended downtime on deployment failure
**Recommendation:** Document rollback procedures

### 25. Optional Environment Variables Cause Silent Degradation
**Problem:** Missing optional env vars (BLOB_READ_WRITE_TOKEN, KV_*) discovered at runtime
**Impact:** Silent feature degradation
**Note:** Using @t3-oss/env-nextjs is good - consider warnings for optional vars

## Recommendations Timeline

### Immediate (Today) ✅ COMPLETED
- [x] Fix auth callback return value (#3)
- [x] Document chat endpoint as intentionally public (#2)
- [x] Configure database pool for serverless (#1)
- [x] Add transaction timeouts (#4)

### Short Term (This Week) ✅ COMPLETED
- [x] Remove BGG in-memory cache (#5)
- [x] Add retry logic to external APIs (#7)
- [x] Close connection in migration script (#9)
- [x] Add embedding dimension validation (#15)
- [x] Fix getAttachment error handling (#17)

### Medium Term (This Month) ✅ COMPLETED (except #19)
- [x] Remove legacy image upload functions (#6)
- [x] Fix image format detection (#16)
- [x] Fix updatedAt trigger (#11)
- [x] Add health check endpoint (#20)
- [x] Add search pagination (#13)
- [x] Implement structured logging (#18)
- [x] Make batch size configurable (#14)
- [ ] Make MODEL configurable (#19) - Deferred per user preference

### Long Term (Future)
- [ ] BGG request queue persistence (#8)
- [ ] Production-like rate limiter for dev (#10)
- [ ] Dynamic batch sizing (#14)
- [ ] Automated migration deployment (#23)
- [ ] E2E tests for critical paths
- [ ] Consider PgBouncer for connection pooling
