# Workflow Runs API - Quick Reference

## TL;DR

```typescript
import { createWorld } from '@workflow/core/runtime';

const world = createWorld();
const runs = await world.runs.list({
  workflowName: 'process-resource',
  pagination: { limit: 50, sortOrder: 'desc' },
  resolveData: 'none'
});

runs.data.forEach(run => console.log(run.runId, run.status));
```

## Core API

**Package:** `@workflow/core`  
**Export:** `createWorld()` from `@workflow/core/runtime`  
**Returns:** `World` object with `.runs` property

## Main Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `world.runs.list(params)` | List workflow runs with filters and pagination | `PaginatedResponse<WorkflowRun>` |
| `world.runs.get(id, params)` | Get specific run by ID | `WorkflowRun` |
| `world.runs.cancel(id)` | Cancel a running workflow | `WorkflowRun` |
| `world.runs.pause(id)` | Pause a workflow | `WorkflowRun` |
| `world.runs.resume(id)` | Resume a paused workflow | `WorkflowRun` |

## ListWorkflowRunsParams

```typescript
{
  workflowName?: string;        // Filter: 'process-resource', etc
  status?: WorkflowRunStatus;   // Filter: 'completed' | 'failed' | 'running' | ...
  pagination?: {
    limit?: number;             // Default: varies by backend (max 1000)
    cursor?: string;            // From previous response for pagination
    sortOrder?: 'asc' | 'desc'; // Default: 'desc' (newest first)
  };
  resolveData?: 'none' | 'all'; // 'none' = minimal, 'all' = full input/output
}
```

## Response Structure

```typescript
{
  data: WorkflowRun[];     // Array of runs
  cursor: string | null;   // Next page cursor (null = end)
  hasMore: boolean;        // True if more results exist
}
```

## WorkflowRun Properties

```typescript
{
  runId: string;           // wrun_*
  workflowName: string;    // 'process-resource', etc
  status: string;          // 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'
  input: any[];            // Input args array
  output?: any;            // Output (undefined if incomplete)
  error?: string;          // Error message if failed
  startedAt?: Date;        // Execution started
  completedAt?: Date;      // Execution completed
  createdAt: Date;         // Run created
  updatedAt: Date;         // Last updated
}
```

## Common Patterns

### List Recent Runs
```typescript
const runs = await world.runs.list({
  pagination: { limit: 50, sortOrder: 'desc' },
  resolveData: 'none'
});
```

### Filter by Workflow
```typescript
const runs = await world.runs.list({
  workflowName: 'process-resource',
  pagination: { limit: 20 }
});
```

### Get Run Details
```typescript
const run = await world.runs.get('wrun_abc123', {
  resolveData: 'all'  // Include full input/output
});
```

### Paginate Through All Results
```typescript
let cursor: string | null | undefined;
let hasMore = true;

while (hasMore) {
  const response = await world.runs.list({
    pagination: { limit: 100, cursor }
  });
  // Process response.data
  cursor = response.cursor;
  hasMore = response.hasMore;
}
```

### Filter by Status
```typescript
const failedRuns = await world.runs.list({
  status: 'failed',
  pagination: { limit: 50 }
});
```

## Environment Setup

Set before calling `createWorld()`:

```typescript
process.env.WORKFLOW_TARGET_WORLD = 'vercel';
process.env.WORKFLOW_VERCEL_AUTH_TOKEN = process.env.VERCEL_AUTH_TOKEN;
process.env.WORKFLOW_VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID;
```

Or for local:

```typescript
process.env.WORKFLOW_TARGET_WORLD = 'embedded';
process.env.WORKFLOW_EMBEDDED_DATA_DIR = '.next/workflow-data';
process.env.PORT = '3000';
```

## TypeScript Imports

```typescript
import { createWorld } from '@workflow/core/runtime';
import type {
  World,
  WorkflowRun,
  WorkflowRunStatus,
  ListWorkflowRunsParams,
  PaginatedResponse,
  PaginationOptions
} from '@workflow/world';
```

## Real-World Example: Reanalyze Failed Resources

```typescript
import { createWorld } from '@workflow/core/runtime';
import type { WorkflowRun } from '@workflow/world';

export async function getFailedResourceProcessing(): Promise<WorkflowRun[]> {
  const world = createWorld();
  
  return (await world.runs.list({
    workflowName: 'process-resource',
    status: 'failed',
    pagination: {
      limit: 100,
      sortOrder: 'desc'
    },
    resolveData: 'all'  // Get error details
  })).data;
}

const failed = await getFailedResourceProcessing();
failed.forEach(run => {
  console.log(`${run.runId}: ${run.error}`);
  console.log(`Input:`, run.input);
});
```

## Important Notes

1. **Env vars first**: Set `process.env.*` BEFORE calling `createWorld()`
2. **Read-only listing**: These are the query APIs - no direct creation via World (use `workflow()` function)
3. **Cursor pagination**: Use `cursor` from response, not offset-based pagination
4. **Data size**: Use `resolveData: 'none'` for list operations to save bandwidth
5. **Caching**: `createWorld()` caches internally - can call multiple times safely

## Source

- Package: `workflow@4.0.1-beta.7` (your project)
- CLI: `npx workflow inspect runs` uses identical APIs
- See full guide: `/WORKFLOW_RUNS_API.md`
