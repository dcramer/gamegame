# Workflows Architecture

This directory contains Vercel Workflows for orchestrating long-running, durable tasks in GameGame.

## Core Concepts

### Workflows vs Steps

Workflows use Vercel's durable execution system to coordinate multi-step processes. The key distinction:

- **Workflows** (`'use workflow'`): Pure coordination logic, **NO Node.js runtime access**
- **Steps** (`'use step'`): Individual tasks with **full Node.js runtime access**

### Critical Rules

1. **NEVER mix `'use workflow'` and `'use step'` in the same file**
2. **NEVER import Node.js modules at the top level of workflow files**
3. **ALWAYS put Node.js operations (db access, file I/O, API calls) in steps**

### Why This Matters

Workflows run in a sandboxed environment that:
- Has no access to Node.js APIs (fs, db, etc.)
- Must be deterministic for resume capability
- Can only import types and pure functions
- Can call step functions which DO have Node.js access

## Directory Structure

```
lib/workflows/
  shared/
    types.ts           # Shared TypeScript types
    helpers.ts         # Shared helper functions (used by steps only!)

  process-resource/
    index.ts           # 'use workflow' - main workflow coordinator
    steps/
      ingest.ts        # 'use step' - PDF extraction
      vision.ts        # 'use step' - Image analysis
      cleanup.ts       # 'use step' - Markdown cleanup
      metadata.ts      # 'use step' - Metadata generation
      embed.ts         # 'use step' - Embedding generation
      finalize.ts      # 'use step' - Finalization

  cleanup-stalled-jobs/
    index.ts           # 'use workflow'
    steps/
      find-stalled-jobs.ts
      mark-jobs-failed.ts

  cleanup-orphaned-blobs/
    index.ts           # 'use workflow'
    steps/
      collect-db-references.ts
      list-blobs.ts
      identify-orphaned.ts
      delete-orphaned.ts
```

## Creating a New Workflow

### 1. Create Workflow Directory

```bash
mkdir -p lib/workflows/my-workflow/steps
```

### 2. Create Workflow File (`index.ts`)

```typescript
/**
 * My Workflow
 *
 * IMPORTANT: This file uses 'use workflow' and CANNOT import Node.js modules.
 */

import { stepOne } from './steps/step-one';
import { stepTwo } from './steps/step-two';

export async function myWorkflow(input: MyInput) {
  'use workflow';

  // Pure coordination logic only
  const result1 = await stepOne(input);
  if (!result1.success) {
    return { success: false, error: result1.error };
  }

  const result2 = await stepTwo(result1.data);
  return { success: true, data: result2 };
}
```

### 3. Create Step Files (`steps/*.ts`)

```typescript
/**
 * Step One - Describe what this step does
 */

import { db } from '@/lib/db';  // ✅ OK in steps
import { someTable } from '@/lib/db/schema';

export async function stepOne(input: MyInput) {
  'use step';

  // Full Node.js access here
  const data = await db.select().from(someTable);

  return { success: true, data };
}
```

## Common Patterns

### Error Handling

Steps should return success/error objects instead of throwing:

```typescript
export async function myStep(input: Input) {
  'use step';

  try {
    // ... do work
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
```

Workflows check success and handle failures:

```typescript
export async function myWorkflow(input: Input) {
  'use workflow';

  const result = await myStep(input);
  if (!result.success) {
    await handleFailureStep(result.error);
    return { success: false };
  }

  return { success: true };
}
```

### Shared Helpers

The `shared/` directory contains:
- `types.ts`: TypeScript interfaces shared across workflows
- `helpers.ts`: Utility functions (⚠️ **ONLY import these in steps, NOT workflows!**)

```typescript
// ❌ WRONG - workflow importing helpers with Node.js deps
import { myHelper } from '../shared/helpers';

export async function myWorkflow() {
  'use workflow';
  await myHelper();  // Will fail!
}

// ✅ CORRECT - step importing helpers
import { myHelper } from '../../shared/helpers';

export async function myStep() {
  'use step';
  await myHelper();  // Works!
}
```

### Conditional Execution

Workflows can have conditional logic:

```typescript
export async function myWorkflow(input: Input) {
  'use workflow';

  const result = await stepOne(input);

  // Skip step two if no images
  if (result.hasImages) {
    await stepTwo(input);
  }

  await stepThree(input);
  return { success: true };
}
```

### Progress Tracking

Update job progress in steps:

```typescript
export async function longRunningStep(jobId: string) {
  'use step';

  const { updateJobProgress } = await import('../../shared/helpers');

  await updateJobProgress(jobId, 'Starting process', 10);
  // ... do work
  await updateJobProgress(jobId, 'Halfway done', 50);
  // ... more work
  await updateJobProgress(jobId, 'Almost done', 90);

  return { success: true };
}
```

## Existing Workflows

### `process-resource`

6-stage PDF processing pipeline:
1. **INGEST**: Extract text/images using Mistral OCR
2. **VISION**: Analyze images with GPT-4o
3. **CLEANUP**: Clean markdown with LLM
4. **METADATA**: Generate resource metadata
5. **EMBED**: Generate embeddings and store fragments
6. **FINALIZE**: Mark resource ready

### `cleanup-stalled-jobs`

Periodic cleanup for jobs stuck in 'processing' state (>30 min):
1. **Find**: Query database for stalled jobs
2. **Mark Failed**: Update job and resource status

### `cleanup-orphaned-blobs`

Periodic cleanup for blobs without database references:
1. **Collect References**: Get all blob keys from database
2. **List Blobs**: Get all files from blob storage
3. **Identify Orphaned**: Find blobs not in database
4. **Delete**: Remove orphaned blobs in batches

## Debugging

### Bundler Issues

If you see bundler errors, it's usually because:
1. Workflow file imports Node.js modules
2. Helper function with Node.js deps imported in workflow

**Solution**: Move all Node.js operations to steps.

### Type Errors

If TypeScript complains about imports:
1. Check that types are properly exported from `shared/types.ts`
2. Verify relative import paths are correct
3. Ensure no circular dependencies

### Runtime Errors

If workflow fails at runtime:
1. Check Vercel Workflow logs for the specific step that failed
2. Look for "Cannot access Node.js runtime" errors
3. Verify all database access is in steps, not workflows

## Best Practices

1. ✅ Keep workflows simple - just coordination logic
2. ✅ Put all complex logic in steps
3. ✅ Make steps idempotent (safe to retry)
4. ✅ Return explicit success/error objects
5. ✅ Log progress for observability
6. ✅ Handle failures gracefully
7. ❌ Don't import Node.js modules in workflows
8. ❌ Don't mix 'use workflow' and 'use step' in one file
9. ❌ Don't put business logic in workflows
10. ❌ Don't throw errors from steps (return error objects instead)

## Testing

Run workflow tests:

```bash
pnpm test lib/workflows
```

Test individual steps in isolation before integrating into workflows.

## Further Reading

- [Vercel Workflows Documentation](https://useworkflow.dev/docs/foundations/workflows-and-steps)
- [Next.js Integration](https://useworkflow.dev/docs/frameworks/next)
