# Jobs Management Page Implementation Guide

## Overview
This guide provides a complete implementation plan for porting the Jobs Management page from the Workers app (React Router + Hono backend) to the Next.js 15 app.

The page displays resource processing jobs with real-time status updates, progress bars, and allows admins to cancel pending/processing jobs or retry failed jobs.

---

## 1. Data Structure

### JobWithDetails Type (Source of Truth)
```typescript
// From workers/src/routes/api/schemas.ts

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobWithDetails {
  // Core job fields
  jobId: string;
  resourceId: string;
  gameId: string;
  status: JobStatus;
  progress: number;           // 0-100
  currentStep?: string;       // e.g., "INGEST", "VISION", "CLEANUP", "METADATA", "EMBED", "FINALIZE"
  error?: string;             // Error message if job failed
  createdAt: number;          // Unix timestamp in milliseconds
  updatedAt: number;          // Unix timestamp in milliseconds
  completedAt?: number;       // Unix timestamp in milliseconds (only when completed/failed)

  // Enriched fields from database join
  resourceName?: string;      // Resource name (e.g., "Core Rulebook")
  gameName?: string;          // Game name (e.g., "Arcs")
}

export interface JobsListResponse {
  jobs: JobWithDetails[];
  cursor?: string;            // For pagination
  hasMore: boolean;
}
```

---

## 2. API Endpoints Required

### GET /api/admin/jobs
**Purpose**: Fetch all jobs with pagination

**Query Parameters**:
- `limit`: number (default: 100) - Max jobs to return
- `cursor`: string (optional) - Pagination cursor

**Response**:
```json
{
  "jobs": [
    {
      "jobId": "job_abc123",
      "resourceId": "res_xyz789",
      "gameId": "game_001",
      "status": "processing",
      "progress": 45,
      "currentStep": "VISION",
      "createdAt": 1730716800000,
      "updatedAt": 1730716845000,
      "gameName": "Arcs",
      "resourceName": "Core Rulebook"
    }
  ],
  "hasMore": false
}
```

**Implementation Notes**:
- Requires admin authentication
- Returns jobs sorted by creation time (newest first)
- Batch-fetches resource and game names in a single database query for performance
- Should use the new `jobs` table in PostgreSQL (not KV storage)

---

### POST /api/admin/jobs/[jobId]/cancel
**Purpose**: Cancel a pending or processing job

**Request**: Empty body

**Response**:
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

**Error Response** (400, 404, 409):
```json
{
  "error": "Job not found" | "Job could not be cancelled - it may have completed" | etc
}
```

**Implementation Notes**:
- Requires admin authentication
- Only cancels jobs with status 'pending' or 'processing'
- Updates job status to 'failed' with processingStage 'cancelled'
- Updates related resource status to 'failed'
- Uses conditional update to prevent race conditions

---

### POST /api/admin/jobs/[jobId]/retry
**Purpose**: Retry a failed job from the stage it failed at

**Request**: Empty body

**Response**:
```json
{
  "success": true,
  "message": "Job retrying!"
}
```

**Error Response** (400, 404):
```json
{
  "error": "Job not found" | "Only failed jobs can be retried"
}
```

**Implementation Notes**:
- Requires admin authentication
- Only retries jobs with status 'failed'
- Creates a new job with the same resourceId
- Determines retry stage from previous job's processingStage
- Maps stage string to task type: 'ingest'→'INGEST', 'vision'→'VISION', etc.
- Re-enqueues the resource for processing
- Updates resource status to 'processing' with new jobId

---

## 3. Features & Behavior

### Auto-Refresh Logic
- Refreshes every 5 seconds when jobs with status 'pending' or 'processing' exist
- Uses `setInterval` that is cleaned up when component unmounts or when no active jobs remain
- Prevents unnecessary API calls by checking `hasActiveJobs` before scheduling refresh
- Uses memoization to avoid recreating interval unnecessarily

### Status Badge Styling
```typescript
type StatusVariant = 'success' | 'error' | 'info' | 'warning' | 'neutral';

function getStatusVariant(status: string): StatusVariant {
  case 'completed': return 'success';     // Green
  case 'failed': return 'error';          // Red
  case 'processing': return 'info';       // Blue
  case 'pending': return 'warning';       // Yellow
  default: return 'neutral';              // Gray
}
```

### Progress Bar
- Width: `${job.progress}%` (0-100%)
- Background color: primary / foreground
- Shows percentage text alongside bar
- Also displays current step below progress if available

### Error Display
- Truncates error messages longer than 50 characters with "..."
- Shows full error on hover via `title` attribute
- Displays in red text below progress bar

### Timestamp Formatting
```typescript
function formatDate(timestamp: number): string {
  // Returns relative dates for recent activity
  // 0-60s: "just now"
  // 1-60m: "5m ago"
  // 1-24h: "2h ago"
  // 1-7d: "3d ago"
  // 7d+: "11/4/2024"
}

function formatDuration(start: number, end?: number): string {
  // Shows job duration
  // <1m: "45s"
  // 1m-1h: "2m 30s"
  // 1h+: "1h 45m"
}
```

### Action Buttons
- **Cancel Button** (red X icon):
  - Shows for pending/processing jobs
  - Disabled while canceling
  - Requires confirmation dialog
  - Message: "Cancel this job?\n\nThe resource will not be processed and the job will be marked as cancelled."

- **Retry Button** (rotate icon):
  - Shows for failed jobs
  - Disabled while retrying
  - Requires confirmation dialog
  - Message: "Retry this job?\n\nIt will be re-queued and processing will start again from the beginning."

### Empty State
- Shows when no jobs exist
- Message: "No jobs found"
- Description: "Jobs appear here when resources are being processed."
- Link: "Back to Admin" → `/admin`

### Toast Notifications
- Success: "Job cancelled successfully!" / "Job retrying!"
- Error: "Failed to cancel job. Please try again." / etc.

---

## 4. Component Structure

### Page Component: `app/admin/jobs/page.tsx`

```typescript
// Server component
// - Requires admin auth (via layout)
// - Fetches initial jobs list via API route
// - Passes data to client component

export default async function JobsPage() {
  const initialJobs = await fetchJobs();
  return <JobsClient initialJobs={initialJobs} />;
}
```

### Client Component: `app/admin/jobs/jobs-client.tsx`

```typescript
"use client"

export default function JobsClient({ initialJobs }: { initialJobs: JobWithDetails[] }) {
  const [jobs, setJobs] = useState<JobWithDetails[]>(initialJobs);
  const [canceling, setCanceling] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  // Auto-refresh when active jobs exist
  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(refreshJobs, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobs]);

  // Handlers for cancel/retry
  async function handleCancel(jobId: string);
  async function handleRetry(jobId: string);

  // Render table with jobs
}
```

### Table Structure

```
┌─────────────┬──────────────┬─────────────────┬────────────┬──────────┬──────────┬─────────┐
│ Status      │ Game         │ Resource        │ Progress   │ Started  │ Duration │ Actions │
├─────────────┼──────────────┼─────────────────┼────────────┼──────────┼──────────┼─────────┤
│ [processing]│ Arcs         │ Rulebook        │ [====--]45%│ 5m ago   │ 1m 30s   │ [X] [↻] │
│             │              │                 │ VISION     │          │          │         │
│ [pending]   │ Catan        │ Player Guide    │ [-------]0%│ just now │ 3s       │ [X]     │
│             │              │                 │            │          │          │         │
│ [completed] │ Ticket to    │ Base Rules      │ [═════════]│ 2h ago   │ 4m 15s   │         │
│             │ Ride         │                 │ 100%       │          │          │         │
│ [failed]    │ Unknown      │ Unknown         │ [==-------]│ 1d ago   │ 2m 10s   │ [↻]     │
│             │              │                 │ 20%        │          │          │         │
│             │              │                 │ Error msg..│          │          │         │
└─────────────┴──────────────┴─────────────────┴────────────┴──────────┴──────────┴─────────┘
```

---

## 5. What Needs to be Created in Next.js

### New Files:

1. **`app/admin/jobs/page.tsx`** (Server Component)
   - Handles admin auth check (via layout)
   - Fetches initial jobs list
   - Passes to client component

2. **`app/admin/jobs/jobs-client.tsx`** (Client Component)
   - Main UI logic
   - State management (jobs, canceling, retrying)
   - Auto-refresh interval
   - Handler functions for cancel/retry
   - Table rendering

3. **`app/api/admin/jobs/route.ts`** (GET endpoint)
   - Admin auth check
   - Query parameters: limit, cursor
   - Batch fetch resource/game names
   - Return paginated jobs list

4. **`app/api/admin/jobs/[jobId]/cancel/route.ts`** (POST endpoint)
   - Admin auth check
   - Fetch job by ID
   - Mark job as 'failed' with stage 'cancelled'
   - Update related resource status
   - Return success/error response

5. **`app/api/admin/jobs/[jobId]/retry/route.ts`** (POST endpoint)
   - Admin auth check
   - Verify job is failed
   - Create new job entry
   - Determine retry stage from metadata
   - Re-enqueue for processing
   - Update resource status
   - Return success/error response

6. **`lib/utils/format-date.ts`** (Utility)
   - `formatDate()`: Relative date formatting
   - `formatDuration()`: Duration formatting

7. **`lib/utils/jobs.ts`** (Utility)
   - `getStatusVariant()`: Map status to badge variant
   - Job-related helpers

### UI Components Needed:
- `Badge` component (create new one or use existing pattern)
- `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableBody`, `TableHead` (existing)
- `Button` (existing)
- `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` (create new)
- Lucide icons: `X`, `RotateCcw` (already available)

---

## 6. Step-by-Step Implementation Checklist

### Phase 1: UI Components & Utilities
- [ ] Create Badge component in `components/ui/badge.tsx`
- [ ] Create Tooltip components in `components/ui/tooltip.tsx`
- [ ] Create format utilities in `lib/utils/format-date.ts`
- [ ] Create jobs utilities in `lib/utils/jobs.ts`

### Phase 2: API Routes
- [ ] Create `app/api/admin/jobs/route.ts` (GET endpoint)
- [ ] Create `app/api/admin/jobs/[jobId]/cancel/route.ts` (POST endpoint)
- [ ] Create `app/api/admin/jobs/[jobId]/retry/route.ts` (POST endpoint)
- [ ] Add tests for all endpoints (mock admin auth, verify responses)

### Phase 3: Database Integration
- [ ] Verify `jobs` table schema exists
- [ ] Create database queries:
  - `getJobs(limit, cursor)`: Paginated jobs list
  - `getJobById(jobId)`: Single job lookup
  - `cancelJob(jobId, resourceId)`: Conditional update
  - `updateJobStatus(jobId, status, stage)`: Status update
  - `createNewJob(resourceId, gameId)`: New job creation
- [ ] Verify resource table fields: `currentJobId`, `status`, `processingStage`

### Phase 4: Page Components
- [ ] Create `app/admin/jobs/page.tsx` (server component)
- [ ] Create `app/admin/jobs/jobs-client.tsx` (client component with all logic)
- [ ] Implement state management (jobs, canceling, retrying)
- [ ] Implement auto-refresh logic
- [ ] Implement cancel handler
- [ ] Implement retry handler
- [ ] Implement table rendering

### Phase 5: Testing
- [ ] Test GET /api/admin/jobs with pagination
- [ ] Test POST /api/admin/jobs/[jobId]/cancel
  - Success case (pending job)
  - Failure cases (completed job, already cancelled)
  - Authorization (non-admin should 401)
- [ ] Test POST /api/admin/jobs/[jobId]/retry
  - Success case (failed job)
  - Failure cases (pending/processing job)
  - Authorization (non-admin should 401)
- [ ] Test component:
  - Auto-refresh triggers only for active jobs
  - Cancel button disabled while canceling
  - Retry button disabled while retrying
  - Toast notifications appear
  - Empty state shows correctly

### Phase 6: Navigation & Integration
- [ ] Add link to Jobs page in admin nav/menu
- [ ] Add Jobs link to admin page (`/admin` → "Jobs" link)
- [ ] Verify breadcrumbs work (Admin → Jobs)
- [ ] Test navigation from job row to game/resource details

---

## 7. Key Implementation Details

### Admin Authentication
```typescript
// In app/api/admin/jobs/route.ts
import { getCurrentUser } from '@/lib/session';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}
```

### Database Queries (using Drizzle)
```typescript
// Get jobs with related data
const jobsWithDetails = await db
  .select({
    // job fields
    jobId: jobs.id,
    resourceId: jobs.resourceId,
    gameId: jobs.gameId,
    status: jobs.status,
    progress: jobs.progress,
    currentStep: jobs.currentStep,
    error: jobs.error,
    createdAt: jobs.createdAt,
    updatedAt: jobs.updatedAt,
    completedAt: jobs.completedAt,

    // resource/game names
    resourceName: resources.name,
    gameName: games.name,
  })
  .from(jobs)
  .leftJoin(resources, eq(jobs.resourceId, resources.id))
  .leftJoin(games, eq(jobs.gameId, games.id))
  .orderBy(desc(jobs.createdAt))
  .limit(limit)
  .offset(offset);
```

### Auto-Refresh Implementation
```typescript
const hasActiveJobs = useMemo(
  () => jobs.some((job) => job.status === 'pending' || job.status === 'processing'),
  [jobs]
);

useEffect(() => {
  if (!hasActiveJobs) return;

  const refreshJobs = async () => {
    try {
      const res = await fetch('/api/admin/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to refresh jobs:', error);
    }
  };

  const interval = setInterval(refreshJobs, 5000);
  return () => clearInterval(interval);
}, [hasActiveJobs]);
```

### Cancel Handler with Confirmation
```typescript
const handleCancel = async (jobId: string) => {
  if (!confirm('Cancel this job?\n\nThe resource will not be processed and the job will be marked as cancelled.')) {
    return;
  }

  setCanceling((prev) => new Set(prev).add(jobId));

  try {
    const response = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
      method: 'POST',
    });

    if (response.ok) {
      // Refresh jobs list
      const res = await fetch('/api/admin/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
      // Toast: success
    } else {
      const errorData = await response.json();
      // Toast: error
    }
  } finally {
    setCanceling((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
  }
};
```

---

## 8. Migration Notes from Workers App

### Key Differences:

1. **Storage**:
   - Workers used Cloudflare KV for job status
   - Next.js should use PostgreSQL `jobs` table for durability

2. **API Client**:
   - Workers used `apiClient.fetch()` from context
   - Next.js uses native `fetch()` API

3. **State Management**:
   - Both use React hooks (useState, useEffect)
   - Implementation is nearly identical

4. **Authentication**:
   - Workers used custom `requireAdmin` middleware
   - Next.js uses `getCurrentUser()` helper from session

5. **Routing**:
   - Workers: React Router file-based routes
   - Next.js: App Router with dynamic segments `[jobId]`

6. **Toast Notifications**:
   - Workers used custom `useFlashNotifications` hook
   - Next.js should use existing toast mechanism (check components)

---

## 9. Testing Examples

### Test GET /api/admin/jobs
```typescript
it('should return paginated jobs list', async () => {
  const res = await fetch('/api/admin/jobs?limit=10', {
    headers: { Cookie: 'auth-token=...' }, // Admin user
  });

  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toHaveProperty('jobs');
  expect(data).toHaveProperty('hasMore');
  expect(Array.isArray(data.jobs)).toBe(true);
});

it('should require admin auth', async () => {
  const res = await fetch('/api/admin/jobs', {
    headers: { Cookie: 'auth-token=...' }, // Non-admin user
  });

  expect(res.status).toBe(401);
});
```

### Test POST /api/admin/jobs/[jobId]/cancel
```typescript
it('should cancel a pending job', async () => {
  const job = await createTestJob('pending');

  const res = await fetch(`/api/admin/jobs/${job.id}/cancel`, {
    method: 'POST',
    headers: { Cookie: 'auth-token=...' }, // Admin user
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    success: true,
    message: expect.stringContaining('cancelled'),
  });
});

it('should not allow cancelling completed jobs', async () => {
  const job = await createTestJob('completed');

  const res = await fetch(`/api/admin/jobs/${job.id}/cancel`, {
    method: 'POST',
    headers: { Cookie: 'auth-token=...' }, // Admin user
  });

  expect(res.status).toBe(409);
});
```

---

## 10. Files Reference Summary

### Absolute Paths to Source Files:

**Workers App (Reference)**:
- `/Users/dcramer/src/gamegame/workers/app/routes/admin.jobs.tsx` - Original page
- `/Users/dcramer/src/gamegame/workers/src/routes/api/resources.ts` - API endpoints
- `/Users/dcramer/src/gamegame/workers/src/routes/api/schemas.ts` - Data schemas
- `/Users/dcramer/src/gamegame/workers/app/components/ui/badge.tsx` - Badge component

**Next.js App (Existing)**:
- `/Users/dcramer/src/gamegame/app/admin/layout.tsx` - Admin layout with auth check
- `/Users/dcramer/src/gamegame/app/admin/page.tsx` - Admin main page
- `/Users/dcramer/src/gamegame/components/ui/table.tsx` - Table component
- `/Users/dcramer/src/gamegame/lib/db/schema/jobs.ts` - Job table schema
- `/Users/dcramer/src/gamegame/lib/session.ts` - Session helper

---

## 11. Styling & CSS Classes

### Tailwind Classes Used:
- `flex flex-col gap-4` - Layout containers
- `align-middle` - Table cell alignment
- `w-24 h-2 bg-muted rounded-full` - Progress bar track
- `h-full bg-primary transition-all` - Progress bar fill
- `text-xs text-muted-foreground` - Small text
- `text-red-500` - Error color
- `h-8 w-8 p-0` - Small button size
- `text-green-600`, `text-red-600`, etc. - Status colors

### Badge Variants:
- `success` - Green background, for 'completed' status
- `error` - Red background, for 'failed' status
- `info` - Blue background, for 'processing' status
- `warning` - Yellow background, for 'pending' status
- `neutral` - Gray background, for unknown status

---

## Summary

The Jobs Management page is a data-heavy admin interface with real-time updates and user confirmations. The implementation requires:

1. **3 API routes** for fetching, canceling, and retrying jobs
2. **2 components** (server + client) for the page UI
3. **Utility functions** for formatting and status mapping
4. **Auto-refresh logic** that intelligently activates only when needed
5. **Toast notifications** for user feedback
6. **Admin authentication** for security

The page should be ready for production once all tests pass and is linked from the admin navigation.
