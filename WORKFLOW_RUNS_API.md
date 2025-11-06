# Vercel Workflows CLI: Programmatic Run Querying Investigation

## Executive Summary

The `npx workflow inspect runs` CLI command works by using the **`@workflow/core`** package's `createWorld()` function, which returns a `World` object with a `runs` property that provides the API for querying workflow runs programmatically.

The CLI implementation shows that you can replicate this functionality without using the CLI by directly using the Workflow core runtime APIs.

---

## Key Findings

### 1. Module/Package That Provides Run Querying

**Primary Package:** `@workflow/core`
- **Export:** `createWorld()` function from `@workflow/core/runtime`
- **Returns:** A `World` object that implements the `Storage` interface
- **Location in your project:** `workflow` (v4.0.1-beta.7)

**Type Definitions Package:** `@workflow/world`
- Contains all TypeScript interfaces for the World and Storage APIs

### 2. Import Statements Needed

```typescript
// For creating and accessing the world
import { createWorld } from '@workflow/core/runtime';

// For type definitions (optional but recommended)
import type { World } from '@workflow/world';
import type { ListWorkflowRunsParams, WorkflowRun, PaginatedResponse } from '@workflow/world';
```

### 3. The World Object Structure

The `World` object is a composite interface with three main parts:

```typescript
interface World extends Queue, Storage, Streamer {
  start?(): Promise<void>;
}

interface Storage {
  runs: {
    create(data: CreateWorkflowRunRequest): Promise<WorkflowRun>;
    get(id: string, params?: GetWorkflowRunParams): Promise<WorkflowRun>;
    update(id: string, data: UpdateWorkflowRunRequest): Promise<WorkflowRun>;
    list(params?: ListWorkflowRunsParams): Promise<PaginatedResponse<WorkflowRun>>;
    cancel(id: string, params?: CancelWorkflowRunParams): Promise<WorkflowRun>;
    pause(id: string, params?: PauseWorkflowRunParams): Promise<WorkflowRun>;
    resume(id: string, params?: ResumeWorkflowRunParams): Promise<WorkflowRun>;
  };
  // ... steps, events, hooks also available
}
```

### 4. Listing Workflow Runs - API Structure

```typescript
interface ListWorkflowRunsParams {
  workflowName?: string;              // Filter by workflow name (optional)
  status?: WorkflowRunStatus;          // Filter by status (optional)
  pagination?: PaginationOptions;      // Pagination controls
  resolveData?: ResolveData;           // Whether to include input/output data
}

interface PaginationOptions {
  limit?: number;                      // Max items to return (default varies, max 1000)
  cursor?: string;                     // Cursor for pagination from previous response
  sortOrder?: 'asc' | 'desc';          // Sort order (default 'desc')
}

type ResolveData = 'none' | 'all';     // 'none' = minimal data, 'all' = full data

interface PaginatedResponse<T> {
  data: T[];                           // Array of results
  cursor: string | null;               // Cursor for next page (null if last page)
  hasMore: boolean;                    // Whether more results exist
}
```

### 5. WorkflowRun Object Structure

```typescript
interface WorkflowRun {
  runId: string;                       // Unique run ID (format: wrun_*)
  deploymentId: string;                // Associated deployment ID
  status: WorkflowRunStatus;           // Status: pending|running|completed|failed|paused|cancelled
  workflowName: string;                // Name of the workflow
  executionContext?: Record<string, any>;
  input: any[];                        // Input arguments array
  output?: any;                        // Output value (undefined if not completed)
  error?: string;                      // Error message (if failed)
  errorCode?: string;                  // Error code (if failed)
  startedAt?: Date;                    // When execution started
  completedAt?: Date;                  // When execution completed
  createdAt: Date;                     // When run was created
  updatedAt: Date;                     // Last update timestamp
}

type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
```

---

## Configuration & Environment Setup

### Environment Variables Required

The `createWorld()` function reads from these environment variables:

```bash
# Required: Determines which world implementation to use
# Options: 'vercel', '@workflow/world-vercel', 'embedded', '@workflow/world-local'
WORKFLOW_TARGET_WORLD=vercel

# For Vercel backend:
WORKFLOW_VERCEL_ENV=production              # or development
WORKFLOW_VERCEL_AUTH_TOKEN=<your-token>     # Vercel auth token
WORKFLOW_VERCEL_PROJECT=<project-id>        # Vercel project ID
WORKFLOW_VERCEL_TEAM=<team-id>              # Vercel team ID (optional)
WORKFLOW_VERCEL_PROXY_URL=https://api.vercel.com/v1/workflow

# For embedded backend:
WORKFLOW_EMBEDDED_DATA_DIR=/path/to/.next/workflow-data
PORT=3000

# Optional
DEBUG=1                                     # Enable debug logging
```

### How the CLI Sets Up Environment

Looking at the CLI's `setupCliWorld()` function (from `/lib/inspect/setup.js`):

```typescript
export const setupCliWorld = async (flags, version) => {
    // Set environment variables for world initialization
    process.env.WORKFLOW_TARGET_WORLD = flags.backend;
    process.env.WORKFLOW_VERCEL_ENV = flags.env;
    process.env.WORKFLOW_VERCEL_AUTH_TOKEN = flags.authToken;
    process.env.WORKFLOW_VERCEL_PROJECT = flags.project;
    process.env.WORKFLOW_VERCEL_TEAM = flags.team;
    
    // Infer missing values based on backend type
    if (flags.backend === 'vercel') {
        await inferVercelEnvVars();
    } else if (flags.backend === 'embedded') {
        await inferEmbeddedWorldEnvVars();
    }
    
    // Create and return world instance
    return createWorld();
};
```

---

## Example Code: Basic Run Listing

### Simple Example - List All Runs

```typescript
import { createWorld } from '@workflow/core/runtime';
import type { PaginatedResponse, WorkflowRun } from '@workflow/world';

// Setup environment variables before calling createWorld
process.env.WORKFLOW_TARGET_WORLD = 'vercel';
process.env.WORKFLOW_VERCEL_AUTH_TOKEN = process.env.VERCEL_AUTH_TOKEN;
process.env.WORKFLOW_VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID;

async function listAllRuns(): Promise<void> {
  const world = createWorld();
  
  const response: PaginatedResponse<WorkflowRun> = await world.runs.list({
    pagination: {
      limit: 20,
      sortOrder: 'desc'
    },
    resolveData: 'none'  // Minimal data (no input/output)
  });
  
  console.log(`Found ${response.data.length} runs`);
  response.data.forEach(run => {
    console.log(`  ${run.runId}: ${run.workflowName} - ${run.status}`);
  });
  
  if (response.hasMore) {
    console.log(`More results available (cursor: ${response.cursor})`);
  }
}

listAllRuns().catch(console.error);
```

### Example - Filter by Workflow Name

```typescript
async function listWorkflowRuns(workflowName: string): Promise<WorkflowRun[]> {
  const world = createWorld();
  
  const response = await world.runs.list({
    workflowName,                      // Filter by workflow name
    pagination: {
      limit: 50,
      sortOrder: 'desc'                // Newest first
    },
    resolveData: 'none'
  });
  
  return response.data;
}

const runs = await listWorkflowRuns('process-resource');
```

### Example - Pagination

```typescript
async function listAllRunsPaginated(
  workflowName?: string
): Promise<WorkflowRun[]> {
  const world = createWorld();
  const allRuns: WorkflowRun[] = [];
  let cursor: string | null | undefined;
  let hasMore = true;
  
  while (hasMore) {
    const response = await world.runs.list({
      workflowName,
      pagination: {
        limit: 100,
        cursor,
        sortOrder: 'desc'
      },
      resolveData: 'none'
    });
    
    allRuns.push(...response.data);
    cursor = response.cursor;
    hasMore = response.hasMore;
  }
  
  return allRuns;
}
```

### Example - Get Detailed Run with Input/Output

```typescript
async function getRunDetails(runId: string): Promise<WorkflowRun> {
  const world = createWorld();
  
  const run = await world.runs.get(runId, {
    resolveData: 'all'  // Include full input and output data
  });
  
  console.log(`Run: ${run.runId}`);
  console.log(`Status: ${run.status}`);
  console.log(`Workflow: ${run.workflowName}`);
  console.log(`Started: ${run.startedAt}`);
  console.log(`Completed: ${run.completedAt}`);
  console.log(`Input:`, run.input);
  console.log(`Output:`, run.output);
  
  if (run.error) {
    console.log(`Error: ${run.error}`);
  }
  
  return run;
}

const run = await getRunDetails('wrun_abc123');
```

### Example - Filter by Status

```typescript
import type { WorkflowRunStatus } from '@workflow/world';

async function listFailedRuns(): Promise<WorkflowRun[]> {
  const world = createWorld();
  
  const response = await world.runs.list({
    status: 'failed' as WorkflowRunStatus,
    pagination: {
      limit: 50,
      sortOrder: 'desc'
    },
    resolveData: 'none'
  });
  
  return response.data;
}
```

### Example - Replicating the CLI's listRuns Command

```typescript
import { createWorld } from '@workflow/core/runtime';
import type { World } from '@workflow/world';

interface InspectOptions {
  json?: boolean;
  runId?: string;
  cursor?: string;
  sort?: 'asc' | 'desc';
  limit?: number;
  workflowName?: string;
  withData?: boolean;
  backend?: string;
}

async function listRuns(world: World, opts: InspectOptions = {}): Promise<void> {
  const resolveData = opts.withData ? 'all' : 'none';
  
  try {
    const runs = await world.runs.list({
      workflowName: opts.workflowName,
      pagination: {
        sortOrder: opts.sort || 'desc',
        cursor: opts.cursor,
        limit: opts.limit || 20
      },
      resolveData
    });
    
    if (opts.json) {
      // JSON output mode
      console.log(JSON.stringify({
        data: runs.data,
        cursor: runs.cursor,
        hasMore: runs.hasMore
      }, null, 2));
    } else {
      // Table output mode
      console.table(runs.data.map(run => ({
        runId: run.runId,
        workflow: run.workflowName,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        ...(opts.withData ? {
          input: JSON.stringify(run.input),
          output: JSON.stringify(run.output)
        } : {})
      })));
    }
  } catch (error) {
    console.error('Failed to list runs:', error);
    throw error;
  }
}

// Usage
const world = createWorld();
await listRuns(world, {
  workflowName: 'process-resource',
  json: false,
  withData: false,
  limit: 20,
  sort: 'desc'
});
```

---

## Setup Instructions for Your Project

### 1. For Vercel Backend (Production/Deployed)

```typescript
// lib/workflows/inspect.ts
import { createWorld } from '@workflow/core/runtime';
import type { WorkflowRun } from '@workflow/world';

export async function getWorkflowRuns(
  workflowName?: string
): Promise<WorkflowRun[]> {
  // These should be set from environment
  process.env.WORKFLOW_TARGET_WORLD = 'vercel';
  process.env.WORKFLOW_VERCEL_AUTH_TOKEN = process.env.VERCEL_AUTH_TOKEN;
  process.env.WORKFLOW_VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID;
  
  const world = createWorld();
  
  const response = await world.runs.list({
    workflowName,
    pagination: {
      limit: 100,
      sortOrder: 'desc'
    },
    resolveData: 'none'
  });
  
  return response.data;
}
```

### 2. For Embedded Backend (Local Development)

```typescript
// lib/workflows/inspect-local.ts
import { createWorld } from '@workflow/core/runtime';
import type { WorkflowRun } from '@workflow/world';
import path from 'path';

export async function getLocalWorkflowRuns(
  workflowName?: string
): Promise<WorkflowRun[]> {
  // Point to local workflow data directory
  process.env.WORKFLOW_TARGET_WORLD = 'embedded';
  process.env.WORKFLOW_EMBEDDED_DATA_DIR = path.join(
    process.cwd(),
    '.next/workflow-data'
  );
  process.env.PORT = '3000';
  
  const world = createWorld();
  
  const response = await world.runs.list({
    workflowName,
    pagination: {
      limit: 100,
      sortOrder: 'desc'
    },
    resolveData: 'none'
  });
  
  return response.data;
}
```

### 3. Server Action Example

```typescript
// app/admin/actions/workflows.ts
'use server';

import { createWorld } from '@workflow/core/runtime';
import type { WorkflowRun } from '@workflow/world';

export async function getRecentWorkflowRuns(): Promise<WorkflowRun[]> {
  const world = createWorld();
  
  const response = await world.runs.list({
    pagination: {
      limit: 50,
      sortOrder: 'desc'
    },
    resolveData: 'none'
  });
  
  return response.data;
}

export async function getWorkflowRunById(runId: string): Promise<WorkflowRun> {
  const world = createWorld();
  return world.runs.get(runId, { resolveData: 'all' });
}

export async function cancelWorkflowRun(runId: string): Promise<void> {
  const world = createWorld();
  await world.runs.cancel(runId);
}
```

---

## How the CLI Does It (Source Code Reference)

The CLI implementation in `@workflow/cli/dist/commands/inspect.js` shows:

1. **Setup** (lines 1-6):
   ```typescript
   const world = await setupCliWorld(flags, version);
   ```

2. **List Runs** (lines 385-393):
   ```typescript
   const runs = await world.runs.list({
     workflowName: opts.workflowName,
     pagination: {
       sortOrder: opts.sort || 'desc',
       cursor: opts.cursor,
       limit: opts.limit || DEFAULT_PAGE_SIZE
     },
     resolveData
   });
   ```

3. **Get Single Run** (line 6 in `/lib/inspect/run.js`):
   ```typescript
   const run = await world.runs.get(runNameOrId);
   ```

---

## Important Notes

### 1. Environment Variable Initialization

The `createWorld()` function reads environment variables at **initialization time**. Set them before calling `createWorld()`, not after.

### 2. World Instance Caching

The core runtime caches the world instance internally:
```typescript
export const getWorld: () => World;
export const setWorld: (world: World | undefined) => void;
```

You can also use `getWorld()` to retrieve a cached instance:
```typescript
import { getWorld } from '@workflow/core/runtime';
const world = getWorld();  // Returns cached instance
```

### 3. Data Resolution Modes

- `resolveData: 'none'` - Minimal data, good for listing (input: [], output: undefined)
- `resolveData: 'all'` - Full data including input/output arrays

Choose 'none' for list operations to reduce payload size.

### 4. Cursor-Based Pagination

The API uses cursor-based pagination:
- Use `cursor` from response to get next page
- `cursor` will be `null` on the last page
- Check `hasMore` boolean to know if more results exist

### 5. World Implementations

Three world implementations are available:
- `vercel` / `@workflow/world-vercel` - Uses Vercel's backend
- `embedded` / `@workflow/world-local` - Uses local SQLite database
- Default behavior depends on `WORKFLOW_TARGET_WORLD` env var

---

## Type Definitions Summary

```typescript
// Main function to import
createWorld(): World

// Key interfaces to import
interface World {
  runs: {
    list(params?: ListWorkflowRunsParams): Promise<PaginatedResponse<WorkflowRun>>;
    get(id: string, params?: GetWorkflowRunParams): Promise<WorkflowRun>;
    cancel(id: string, params?: CancelWorkflowRunParams): Promise<WorkflowRun>;
    pause(id: string, params?: PauseWorkflowRunParams): Promise<WorkflowRun>;
    resume(id: string, params?: ResumeWorkflowRunParams): Promise<WorkflowRun>;
  };
  steps: { /* ... */ };
  events: { /* ... */ };
  hooks: { /* ... */ };
}

interface ListWorkflowRunsParams {
  workflowName?: string;
  status?: WorkflowRunStatus;
  pagination?: PaginationOptions;
  resolveData?: ResolveData;
}

interface PaginationOptions {
  limit?: number;
  cursor?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

interface WorkflowRun {
  runId: string;
  deploymentId: string;
  status: WorkflowRunStatus;
  workflowName: string;
  input: any[];
  output?: any;
  error?: string;
  errorCode?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
```

---

## Verification

This investigation was verified by examining:
- `/node_modules/@workflow/core/dist/runtime.d.ts` - Core exports
- `/node_modules/@workflow/world/dist/interfaces.d.ts` - World interface definition
- `/node_modules/@workflow/cli/dist/commands/inspect.js` - CLI implementation
- `/node_modules/@workflow/cli/dist/lib/inspect/setup.js` - Environment setup
- `/node_modules/@workflow/cli/dist/lib/inspect/output.js` - Actual run listing (lines 373-436)

All file paths are from version `workflow@4.0.1-beta.7` in your project.

