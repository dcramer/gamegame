# Workflow Usage Guide

This guide covers practical usage of Vercel Workflows in GameGame, including development, debugging, and monitoring.

## Quick Start

### Starting a Workflow

Workflows are invoked using the `start()` function from `workflow/api`:

```typescript
import { start } from 'workflow/api';
import { processResourceWorkflow } from '@/workflows/process-resource';

// Start workflow with input
const runId = await start(processResourceWorkflow, [
  {
    runId: 'unique-run-id',
    resourceId: 'resource-123',
    gameId: 'game-456',
    fromStage: 'ingest', // Optional: resume from specific stage
  },
]);

console.log('Workflow started:', runId);
```

The `start()` function returns a unique run ID that can be used to track the workflow's progress.

### Resuming from a Specific Stage

The `process-resource` workflow supports resuming from any stage:

```typescript
await start(processResourceWorkflow, [
  {
    runId: 'unique-run-id',
    resourceId: 'resource-123',
    gameId: 'game-456',
    fromStage: 'vision', // Resume from vision stage
  },
]);
```

Available stages: `ingest`, `vision`, `cleanup`, `metadata`, `embed`, `finalize`

## Inspecting Workflows

### Command-Line Inspection

The Workflow CLI provides powerful inspection capabilities:

```bash
# List recent workflow runs
npx workflow inspect runs

# List runs with full input/output data
npx workflow inspect runs --withData

# List only 50 most recent runs
npx workflow inspect runs --limit 50

# Filter by workflow name
npx workflow inspect runs --workflowName="processResourceWorkflow"

# Inspect a specific run
npx workflow inspect run run_01K5WAJZ8W367CV2RFKDSDNWB8

# Get run details as JSON (useful for scripting)
npx workflow inspect run run_01K5WAJZ8W367CV2RFKDSDNWB8 --json

# List steps for a specific run
npx workflow inspect steps --runId=run_01K5WAJZ8W367CV2RFKDSDNWB8

# Inspect a specific step
npx workflow inspect step step_01K5WAJZ8W367CV2RFKDSDNWB8

# List events for a run
npx workflow inspect events --runId=run_01K5WAJZ8W367CV2RFKDSDNWB8

# List events for a specific step
npx workflow inspect events --stepId=step_01K5WAJZ8W367CV2RFKDSDNWB8

# Open web UI for visual inspection
npx workflow web
```

### Web UI

The web UI provides a visual interface for inspecting workflows:

```bash
# Open web UI (automatically opens browser)
npx workflow web

# Open without launching browser automatically
npx workflow web --no-browser
```

The web UI shows:
- Workflow run history
- Step-by-step execution timeline
- Input/output for each step
- Error details and stack traces
- Retry history

### Programmatic Inspection

You can also inspect workflows programmatically using the database:

```typescript
import { db } from '@/lib/db';
import { workflowRuns, workflowJobs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Find runs by workflow name
const runs = await db
  .select()
  .from(workflowRuns)
  .where(eq(workflowRuns.workflowName, 'processResourceWorkflow'))
  .orderBy(desc(workflowRuns.createdAt))
  .limit(10);

// Find job by resource ID
const job = await db
  .select()
  .from(workflowJobs)
  .where(eq(workflowJobs.resourceId, resourceId))
  .orderBy(desc(workflowJobs.createdAt))
  .limit(1);
```

## Error Handling and Retries

### Automatic Retries

Vercel Workflows automatically retry steps on transient failures:

- **Default retry behavior**: 3 attempts with exponential backoff
- **Network errors**: Automatically retried
- **Timeouts**: Automatically retried
- **5xx API errors**: Automatically retried
- **4xx errors**: NOT retried (considered permanent failures)

### Manual Retry

To manually retry a failed workflow:

```bash
# Via CLI (if implemented)
npx workflow retry run_01K5WAJZ8W367CV2RFKDSDNWB8

# Or trigger via API endpoint
curl -X POST http://localhost:3000/api/admin/workflows/{runId}/retry
```

### Error Handling Pattern

All steps in GameGame follow this error handling pattern:

```typescript
export async function myStep(input: StepInput) {
  'use step';

  try {
    // Do work
    const result = await someAsyncOperation();

    return { success: true, data: result };
  } catch (error) {
    // Log error for debugging
    console.error('Step failed:', error);

    // Return structured error (don't throw!)
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
```

Workflows check for errors and handle them:

```typescript
export async function myWorkflow(input: WorkflowInput) {
  'use workflow';

  const result = await myStep(input);

  if (!result.success) {
    // Handle failure (e.g., mark job as failed)
    await markJobFailedStep(input.runId, input.resourceId, result.error);
    return { success: false, error: result.error };
  }

  return { success: true };
}
```

## Idempotency

### Why Idempotency Matters

Workflows can be retried at any point due to:
- Transient failures (network issues, API timeouts)
- Infrastructure failures (server restarts)
- Manual retries by developers

Steps MUST be idempotent to ensure safe retries.

### Making Steps Idempotent

**Pattern 1: Check-then-write**
```typescript
export async function createResourceStep(input: CreateInput) {
  'use step';

  // Check if resource already exists
  const existing = await db
    .select()
    .from(resources)
    .where(eq(resources.id, input.resourceId))
    .limit(1);

  if (existing.length > 0) {
    // Already created, return success
    return { success: true, data: existing[0] };
  }

  // Create resource
  const [resource] = await db.insert(resources).values(input).returning();

  return { success: true, data: resource };
}
```

**Pattern 2: Upsert**
```typescript
export async function updateMetadataStep(input: UpdateInput) {
  'use step';

  // Use upsert to handle both create and update
  const [resource] = await db
    .insert(resources)
    .values(input)
    .onConflictDoUpdate({
      target: resources.id,
      set: {
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { success: true, data: resource };
}
```

**Pattern 3: Delete-then-create**
```typescript
export async function regenerateFragmentsStep(resourceId: string) {
  'use step';

  // Delete existing fragments
  await db.delete(fragments).where(eq(fragments.resourceId, resourceId));

  // Create new fragments
  const newFragments = await generateFragments(resourceId);
  await db.insert(fragments).values(newFragments);

  return { success: true };
}
```

### Testing Idempotency

Always test that steps can be safely re-run:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { cleanupTestDb } from '@/tests/db-helpers';
import { myStep } from './my-step';

afterEach(cleanupTestDb);

it('should be idempotent', async () => {
  const input = { resourceId: 'test-123', name: 'Test' };

  // Run step twice
  const result1 = await myStep(input);
  const result2 = await myStep(input);

  // Both should succeed
  expect(result1.success).toBe(true);
  expect(result2.success).toBe(true);

  // Result should be the same
  expect(result1.data).toEqual(result2.data);
});
```

## Observability

### Progress Tracking

Track workflow progress using the job status system:

```typescript
import { updateJobProgress } from '@/workflows/shared/helpers';

export async function longRunningStep(jobId: string) {
  'use step';

  await updateJobProgress(jobId, 'Starting extraction', 10);

  // Do work
  const extracted = await extractPDF();

  await updateJobProgress(jobId, 'Processing images', 50);

  // More work
  await processImages(extracted.images);

  await updateJobProgress(jobId, 'Finalizing', 90);

  return { success: true };
}
```

Progress is stored in the `workflow_jobs` table and can be displayed in UI.

### Logging

Use console logging liberally in steps (not workflows):

```typescript
export async function myStep(input: StepInput) {
  'use step';

  console.log('[myStep] Starting with input:', input);

  try {
    const result = await doWork(input);
    console.log('[myStep] Completed successfully:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('[myStep] Failed:', error);
    return { success: false, error: String(error) };
  }
}
```

Logs are available via:
- Vercel deployment logs (production)
- `npx workflow inspect step <step-id>` (includes stdout/stderr)
- Local console output (development)

### Monitoring

Monitor workflow health using these queries:

```typescript
import { db } from '@/lib/db';
import { workflowJobs } from '@/lib/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';

// Find stalled jobs (processing for >30 minutes)
const stalledJobs = await db
  .select()
  .from(workflowJobs)
  .where(
    and(
      eq(workflowJobs.status, 'processing'),
      lt(
        workflowJobs.startedAt,
        sql`NOW() - INTERVAL '30 minutes'`
      )
    )
  );

// Find recent failures
const failures = await db
  .select()
  .from(workflowJobs)
  .where(eq(workflowJobs.status, 'failed'))
  .orderBy(desc(workflowJobs.createdAt))
  .limit(10);

// Calculate success rate
const stats = await db
  .select({
    status: workflowJobs.status,
    count: sql<number>`count(*)`,
  })
  .from(workflowJobs)
  .groupBy(workflowJobs.status);
```

## Development Workflow

### Local Development

1. **Start PostgreSQL with Workflow backend**:
   ```bash
   docker-compose up -d
   ```

2. **Run migrations**:
   ```bash
   pnpm db:migrate
   ```

3. **Start dev server**:
   ```bash
   pnpm dev
   ```

4. **Trigger a workflow** (via UI or API):
   - Upload a PDF in `/admin/games/{gameId}`
   - Or use API: `POST /api/games/{gameId}/resources`

5. **Monitor progress**:
   ```bash
   # Watch runs in real-time
   npx workflow inspect runs

   # Or use web UI
   npx workflow web
   ```

### Testing Workflows

Test workflows in isolation:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { runIngestStage } from '@/workflows/process-resource/steps/ingest';

afterEach(cleanupTestDb);

it('should extract PDF content', async () => {
  const game = await createTestGame({ name: 'Arcs' });
  const resource = await createTestResource({
    gameId: game.id,
    url: 'https://example.com/rulebook.pdf',
  });

  const result = await runIngestStage({
    runId: 'test-run',
    resourceId: resource.id,
    gameId: game.id,
  });

  expect(result.success).toBe(true);

  // Verify content was extracted
  const updated = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resource.id))
    .limit(1);

  expect(updated[0].content).toBeTruthy();
  expect(updated[0].pageCount).toBeGreaterThan(0);
});
```

Run tests:
```bash
# All tests
pnpm test

# Workflow tests only
pnpm test workflows/

# Specific workflow
pnpm test workflows/process-resource/
```

## Common Patterns

### Conditional Execution

Skip steps based on data:

```typescript
export async function myWorkflow(input: WorkflowInput) {
  'use workflow';

  const ingestResult = await runIngestStage(input);
  if (!ingestResult.success) {
    return { success: false, error: ingestResult.error };
  }

  // Only run vision if images were found
  if (ingestResult.data.imageCount > 0) {
    const visionResult = await runVisionStage(input);
    if (!visionResult.success) {
      return { success: false, error: visionResult.error };
    }
  }

  await runFinalizeStage(input);
  return { success: true };
}
```

### Parallel Execution

Run independent steps in parallel:

```typescript
export async function myWorkflow(input: WorkflowInput) {
  'use workflow';

  // Run two independent steps in parallel
  const [result1, result2] = await Promise.all([
    runStepOne(input),
    runStepTwo(input),
  ]);

  if (!result1.success || !result2.success) {
    return { success: false };
  }

  return { success: true };
}
```

### Batch Processing

Process items in batches:

```typescript
export async function batchProcessStep(items: Item[]) {
  'use step';

  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    // Process batch
    const batchResults = await Promise.all(
      batch.map((item) => processItem(item))
    );

    results.push(...batchResults);

    // Optional: Add delay between batches to avoid rate limits
    if (i + BATCH_SIZE < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return { success: true, data: results };
}
```

## Troubleshooting

### "Cannot access Node.js runtime" Error

**Cause**: Workflow file is importing Node.js modules.

**Solution**: Move Node.js code to a step:

```typescript
// ❌ WRONG
import { db } from '@/lib/db'; // Node.js module

export async function myWorkflow() {
  'use workflow';
  await db.select(); // Error!
}

// ✅ CORRECT
export async function myWorkflow() {
  'use workflow';
  await myStep(); // Step has Node.js access
}
```

### Workflow Stuck in "Processing" State

**Cause**: Step threw an unhandled error or workflow was interrupted.

**Solutions**:

1. **Check logs**:
   ```bash
   npx workflow inspect run <run-id>
   ```

2. **Manually mark as failed** (if truly stuck):
   ```typescript
   await db
     .update(workflowJobs)
     .set({ status: 'failed', errorMessage: 'Manually marked failed' })
     .where(eq(workflowJobs.id, jobId));
   ```

3. **Run cleanup workflow**:
   ```bash
   # Marks jobs stuck >30 minutes as failed
   # This runs automatically via cron in production
   ```

### Step Keeps Retrying Forever

**Cause**: Step returns `{ success: false }` but error is transient.

**Solution**: Make error permanent or fix the underlying issue:

```typescript
export async function myStep(input: StepInput) {
  'use step';

  try {
    await callExternalAPI();
    return { success: true };
  } catch (error) {
    // Check if error is retryable
    if (error.status === 429) {
      // Rate limit - should retry
      throw error; // Let workflow retry
    } else if (error.status === 404) {
      // Not found - permanent failure
      return { success: false, error: 'Resource not found' };
    }

    // Unknown error - retry
    throw error;
  }
}
```

### Workflow Succeeded But Data Missing

**Cause**: Step reported success but didn't actually complete work (idempotency issue).

**Solution**: Check step implementation and add validation:

```typescript
export async function myStep(input: StepInput) {
  'use step';

  // Do work
  const result = await doWork(input);

  // Validate result before returning success
  if (!result || !result.data) {
    return { success: false, error: 'Work completed but no data returned' };
  }

  return { success: true, data: result.data };
}
```

## Best Practices

1. ✅ **Always make steps idempotent** - they can be retried at any point
2. ✅ **Return structured success/error objects** - don't throw from steps
3. ✅ **Log progress liberally** - helps with debugging
4. ✅ **Test steps in isolation** - easier to debug than full workflows
5. ✅ **Use the CLI for debugging** - faster than reading database tables
6. ✅ **Monitor stalled jobs** - set up alerts for jobs stuck >30 minutes
7. ✅ **Keep workflows simple** - just coordination, not business logic
8. ✅ **Handle both transient and permanent errors** - retry transient, fail permanent
9. ✅ **Validate inputs early** - fail fast on invalid data
10. ✅ **Track progress for long-running steps** - improves user experience

## Further Reading

- [AGENTS.md](./AGENTS.md) - Architecture and patterns for workflow development
- [Vercel Workflows Documentation](https://useworkflow.dev/docs)
- [Observability Guide](https://useworkflow.dev/docs/observability)
- [Error Handling](https://useworkflow.dev/docs/foundations/errors-and-retries)
- [Idempotency](https://useworkflow.dev/docs/foundations/idempotency)
