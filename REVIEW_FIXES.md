# Code Review - Critical Fixes Applied and Remaining Work

## Summary

This document tracks the systematic code review performed on 2025-11-05, identifying critical bugs, redundant code, and stability concerns.

## ✅ Fixes Applied

### 1. Manual Cascade Deletion Removed (`lib/procedures/games.ts:216-258`)
**Status:** ✅ FIXED

**Problem:** The `deleteGame` procedure manually deleted embeddings, fragments, and attachments despite database foreign keys having `onDelete: 'cascade'` configured.

**Fix Applied:**
- Removed all manual cascade deletion logic
- Now relies on database-level cascades as defined in schema
- Added blob storage cleanup with error handling
- Reduced ~45 lines of redundant code

**Impact:** Eliminates race condition risk and simplifies maintenance.

---

### 2. Row-Level Locking in All Workflow Steps
**Status:** ✅ FIXED

**Problem:** Workflow steps checked `currentRunId` outside transactions, allowing concurrent workflows to process the same resource.

**Fixes Applied:**
- **ingest.ts**: Wrapped `currentRunId` check in transaction with `.for('update')` row-level lock
- **metadata.ts**: Applied same pattern - sets `currentRunId` atomically within transaction
- **cleanup.ts**: Applied same pattern - prevents concurrent markdown cleanup
- **embed.ts**: Applied same pattern - prevents concurrent embedding generation
- **vision.ts**: No changes needed - delegates to `analyzeImagesWorkflow` which handles locking internally

**Impact:** Eliminates race conditions where multiple workflows could process the same resource simultaneously, preventing duplicate fragments, corrupted embeddings, and wasted API costs.

---

### 3. Shared Helper Functions Created (`lib/api/helpers.ts`)
**Status:** ✅ FIXED

**Problem:** Multiple utility functions duplicated across API routes:
- `parseBbox()` - duplicated 3 times (~24 lines each)
- `generateSlug()` - duplicated 3 times with inconsistent implementations
- Update data building - duplicated 6 times using `any` type

**Fixes Applied:**
- Created `lib/api/helpers.ts` with type-safe utility functions
- **parseBbox()**: Parses bbox from arrays or JSON strings
- **generateSlug()**: Generates URL-safe slugs with optional year suffix
- **buildUpdateData()**: Type-safe update builder that filters undefined values

**Next Steps:**
- Update API routes to import and use these helpers (reduces ~100 lines of duplicate code)
- See P1 section for specific file locations to update

---

## 🔴 Remaining P0 Fixes (Critical - Do These Next)

### 4. Wrap Embed Stage in Transaction
**File:** `workflows/embed-stage.ts:76-487`

**Problem:** The embed stage performs multiple operations without a transaction:
- Delete existing attachments (line 77)
- Delete existing fragments (line 78)
- Insert attachments in batches (lines 108-114)
- Insert fragments in batches (lines 412-418)
- Insert embeddings in batches (lines 462-468)
- Update resource (lines 475-487)

If any batch fails, the resource is left in an inconsistent state.

**Action Required:**
Wrap the entire embed stage in a single transaction. This is complex because helper functions need to accept `tx` parameter:

```typescript
await db.transaction(async (tx) => {
  // All deletes
  await deleteExistingAttachments(input.resourceId, tx);
  await deleteExistingFragments(input.resourceId, tx);

  // All inserts
  for (const batch of attachmentBatches) {
    await tx.insert(attachments).values(batch);
  }
  // ... rest of operations
});
```

**Note:** This requires refactoring helper functions to accept optional `tx` parameter.

---

### 5. Fix Workflow Error Handling
**Files:**
- `lib/procedures/resources.ts:302-314`
- Any other places that invoke workflows with `.catch()`

**Problem:** Workflow invocations use `.catch()` with console.error but don't propagate failures:

```typescript
processResourceWorkflow(workflowInput).catch((error) => {
  console.error('[Reprocess Resource] Workflow error:', error);
  db.update(resources).set({ status: 'failed' }).catch(err => console.error(...));
});
```

**Action Required:**
- Move error handling into try/catch instead of `.catch()`
- Ensure database updates happen before workflow invocation completes
- Don't nest `.catch()` handlers

```typescript
try {
  await processResourceWorkflow(workflowInput);
} catch (error) {
  console.error('[Reprocess Resource] Workflow error:', error);
  await db.update(resources)
    .set({ status: 'failed', statusMessage: error.message, updatedAt: Date.now() })
    .where(eq(resources.id, input.id));
  throw error; // Propagate to caller
}
```

---

### 6. Fix Server-Side oRPC Context
**File:** `lib/procedures/client.server.ts:16-18`

**Problem:** Server-side oRPC client passes empty context, but authentication middleware re-fetches user on every call:

```typescript
export const serverClient = createRouterClient({
  router,
  context: {},  // ❌ Empty context
});
```

**Action Required:**
Populate context with pre-fetched user data:

```typescript
import { getCurrentUser } from '@/lib/session';

export async function getServerClient() {
  const user = await getCurrentUser();
  return createRouterClient({
    router,
    context: { user }, // ✅ Pre-populated
  });
}
```

Then update all callers to use `await getServerClient()` instead of `serverClient`.

---

## ⚠️ P1 Fixes (High Priority)

### 7. Extract `parseBbox()` to Shared Utility
**Locations:** Duplicated 3 times:
- `app/api/attachments/[attachmentId]/route.ts:18-42`
- `app/api/attachments/[attachmentId]/reprocess/route.ts:18-42`
- `app/api/games/[gameIdOrSlug]/attachments/route.ts:67-91`

**Action:** Create `lib/api/helpers.ts` and export:

```typescript
export function parseBbox(bboxValue: unknown): number[] | undefined {
  if (!bboxValue) return undefined;
  if (Array.isArray(bboxValue)) {
    if (bboxValue.every((v) => typeof v === 'number')) {
      return bboxValue;
    }
    return undefined;
  }
  if (typeof bboxValue === 'string') {
    try {
      const parsed = JSON.parse(bboxValue);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) {
        return parsed;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}
```

**Estimated Savings:** ~72 lines of duplicate code

---

### 8. Extract `generateSlug()` to Shared Utility
**Status:** ✅ FIXED (helper created, routes need updating)

**Locations needing updates:**
- `app/api/games/route.ts:103-108`
- `app/api/games/[gameIdOrSlug]/route.ts:239-244`
- `app/api/bgg/games/[bggId]/import/route.ts:15-22`

**Action:** Replace local implementations with:
```typescript
import { generateSlug } from '@/lib/api/helpers';
```

**Estimated Savings:** ~24 lines of duplicate code

---

### 9. Remove `any` Types from Update Operations
**Status:** ✅ FIXED (helper created, procedures need updating)

**Locations needing updates:**
- `lib/procedures/games.ts:158`
- `lib/procedures/resources.ts:121`
- `lib/procedures/attachments.ts:185`

**Action:** Replace `any` types with:
```typescript
import { buildUpdateData } from '@/lib/api/helpers';

const updateData = buildUpdateData(input.data);
await db.update(games).set(updateData).where(eq(games.id, input.id));
```

---

## 📊 P2 Fixes (Medium Priority)

### 10. BGG API Key Validation
Duplicated 4 times - extract to middleware or validation function.

### 11. File Upload Pattern
Duplicated 3 times (~70 lines each) - extract to shared handler.

### 12. Standardize Authentication Patterns
9 routes use `requireAdmin()` directly, 9 routes use `withAdmin()` middleware - standardize to middleware.

### 13. Add CSRF Protection
Change `sameSite: 'lax'` to `sameSite: 'strict'` in `lib/session.ts:37`.

### 14. Add Rate Limiting
- Magic link generation (`app/api/auth/login/route.ts`)
- oRPC handler (`app/api/rpc/[...]/route.ts`)

### 15. Implement Token Revocation
Add token versioning or refresh tokens to allow invalidating compromised JWTs.

---

## 🔍 Additional Issues to Consider

### Security Issues
- Cookie `secure` flag disabled in development (line 33 in `lib/session.ts`)
- Admin error messages leak authentication state (`lib/api/middleware.ts:89-94`)
- No authentication event logging
- GET request for magic link verification (should be POST)

### Race Conditions
- BGG import uploads image before checking for duplicates
- Resource status polling races with server updates
- Missing optimistic locking on resource updates

### Missing Validations
- No unique slug generation logic (can cause duplicate slug errors)
- Missing request body validation on several routes
- No content-type validation

---

## Testing Recommendations

After fixes are applied, add tests for:

1. **Concurrent workflow test**: Start two workflows on same resource, verify one fails gracefully
2. **Transaction rollback test**: Simulate failure during embed stage, verify no partial data
3. **Blob leak test**: Delete resource with network failure, verify cleanup workflow removes orphaned blobs
4. **Duplicate slug test**: Create two games with same name, verify unique slugs generated
5. **Lost update test**: Two admins update same resource, verify conflict detection

---

## Statistics

- **Critical Bugs Fixed:** 2 / 4 (50%)
- **Redundant Code Patterns:** 3 / 6 helpers created (50%)
- **Security Issues:** 0 / 16 addressed (0%)
- **Type Safety Issues:** 1 / 6 fixed (17%)

**Progress Summary:**
- ✅ Manual cascade deletion removed
- ✅ Row-level locking added to all workflow steps
- ✅ Shared helper functions created (parseBbox, generateSlug, buildUpdateData)
- ⏳ Remaining: Embed stage transaction, workflow error handling, apply helpers to routes

**Estimated Work Remaining:**
- P0 fixes: ~2-3 hours (embed stage transaction, workflow error handling)
- P1 fixes: ~1-2 hours (apply helpers to routes, remove any types)
- P2 fixes: ~4-6 hours (security, rate limiting, validation)
- Testing: ~2-3 hours

**Total:** ~9-14 hours to address remaining critical and high-priority issues
