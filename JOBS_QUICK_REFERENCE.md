# Jobs Management Page - Quick Summary

## What is Being Ported?
A real-time admin dashboard showing resource processing job status with cancel/retry capabilities.

**Source**: `/Users/dcramer/src/gamegame/workers/app/routes/admin.jobs.tsx`

---

## Core Data Model

```typescript
interface JobWithDetails {
  jobId: string;
  resourceId: string;
  gameId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;              // 0-100%
  currentStep?: string;          // INGEST, VISION, CLEANUP, METADATA, EMBED, FINALIZE
  error?: string;                // Error message if failed
  createdAt: number;             // Timestamp in ms
  updatedAt: number;
  completedAt?: number;
  resourceName?: string;         // From database join
  gameName?: string;             // From database join
}
```

---

## 3 API Endpoints to Create

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/admin/jobs` | GET | List all jobs with pagination | Admin |
| `/api/admin/jobs/[jobId]/cancel` | POST | Mark job as failed/cancelled | Admin |
| `/api/admin/jobs/[jobId]/retry` | POST | Retry a failed job | Admin |

---

## Files to Create

```
app/
  admin/
    jobs/
      page.tsx              (Server component - fetches initial data)
      jobs-client.tsx       (Client component - UI + state management)
  api/
    admin/
      jobs/
        route.ts            (GET /api/admin/jobs)
        [jobId]/
          cancel/
            route.ts        (POST cancel)
          retry/
            route.ts        (POST retry)

components/
  ui/
    badge.tsx              (Status badge component)
    tooltip.tsx            (Cancel/Retry button tooltips)

lib/
  utils/
    format-date.ts         (formatDate, formatDuration helpers)
    jobs.ts                (getStatusVariant, job utilities)
```

---

## Key Features

### Auto-Refresh
- Polls API every 5 seconds
- Only when jobs with status 'pending' or 'processing' exist
- Cleans up interval on unmount or when no active jobs

### Progress Bar
- Width: `${job.progress}%`
- Shows current step below bar (e.g., "VISION")
- Shows error message below if job failed

### Status Badges
- `pending` → Yellow badge
- `processing` → Blue badge
- `completed` → Green badge
- `failed` → Red badge

### Action Buttons
- **Cancel** (X icon): Shows for pending/processing, requires confirmation
- **Retry** (rotate icon): Shows for failed, requires confirmation

### Empty State
- "No jobs found" message with link back to admin page

---

## State Management

```typescript
const [jobs, setJobs] = useState<JobWithDetails[]>(initialJobs);
const [canceling, setCanceling] = useState<Set<string>>(new Set());
const [retrying, setRetrying] = useState<Set<string>>(new Set());
const hasActiveJobs = useMemo(
  () => jobs.some(j => j.status === 'pending' || j.status === 'processing'),
  [jobs]
);
```

---

## Implementation Order

1. **Create UI Components**
   - Badge component
   - Tooltip components

2. **Create Utility Functions**
   - formatDate() - relative dates
   - formatDuration() - elapsed time
   - getStatusVariant() - badge colors

3. **Create API Routes**
   - GET /api/admin/jobs
   - POST /api/admin/jobs/[jobId]/cancel
   - POST /api/admin/jobs/[jobId]/retry

4. **Create Page Components**
   - app/admin/jobs/page.tsx
   - app/admin/jobs/jobs-client.tsx

5. **Add Navigation**
   - Link from admin page to jobs page

6. **Test Everything**

---

## Database Schema (Already Exists)

```typescript
// From lib/db/schema/jobs.ts
export const jobs = pgTable('jobs', {
  id: varchar('id', { length: 191 }).primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 191 }).notNull(),
  gameId: varchar('game_id', { length: 191 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  progress: integer('progress').notNull().default(0),
  currentStep: text('current_step'),
  error: jsonb('error'),
  metadata: jsonb('metadata'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  completedAt: bigint('completed_at', { mode: 'number' }),
});
```

---

## Admin Auth Check Pattern

```typescript
import { getCurrentUser } from '@/lib/session';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of logic
}
```

---

## Key Differences from Workers App

| Aspect | Workers | Next.js |
|--------|---------|---------|
| Storage | Cloudflare KV | PostgreSQL `jobs` table |
| API Client | `apiClient.fetch()` | Native `fetch()` |
| Auth | `requireAdmin` middleware | `getCurrentUser()` function |
| Routing | React Router file-based | Next.js App Router |
| Toast Notifications | Custom hook | Existing toast system |

---

## Important Implementation Details

### Cancel Logic
1. Get job from database
2. Mark as 'failed' with processingStage 'cancelled'
3. Update related resource status
4. Use conditional update to prevent race conditions

### Retry Logic
1. Verify job is 'failed'
2. Create new job entry with same resourceId
3. Determine retry stage from previous job's processingStage
4. Re-enqueue for processing
5. Update resource status to 'processing'

### Timestamps
- All timestamps are Unix milliseconds (not seconds)
- Use for relative display ("5m ago") and duration calculation

---

## Testing Checklist

- [ ] GET /api/admin/jobs returns paginated list
- [ ] GET /api/admin/jobs requires admin auth
- [ ] POST /api/admin/jobs/[jobId]/cancel works for pending jobs
- [ ] POST /api/admin/jobs/[jobId]/cancel fails for completed jobs
- [ ] POST /api/admin/jobs/[jobId]/retry works for failed jobs
- [ ] POST /api/admin/jobs/[jobId]/retry fails for pending/processing
- [ ] Auto-refresh only triggers when active jobs exist
- [ ] Cancel button disabled while canceling
- [ ] Retry button disabled while retrying
- [ ] Toast notifications appear
- [ ] Empty state displays correctly
- [ ] Table links to game/resource details work

---

## Reference Files

**Workers App** (for reference):
- `/Users/dcramer/src/gamegame/workers/app/routes/admin.jobs.tsx` (347 lines)
- `/Users/dcramer/src/gamegame/workers/src/routes/api/resources.ts` (250+ lines)
- `/Users/dcramer/src/gamegame/workers/app/components/ui/badge.tsx`

**Next.js App** (to use):
- `/Users/dcramer/src/gamegame/app/admin/layout.tsx` (auth pattern)
- `/Users/dcramer/src/gamegame/components/ui/table.tsx` (table component)
- `/Users/dcramer/src/gamegame/lib/session.ts` (getCurrentUser)

---

## Estimated Effort

- **Utilities**: 30 min
- **UI Components**: 30 min
- **API Routes**: 1.5 hours
- **Page Components**: 1 hour
- **Testing**: 1 hour
- **Navigation Integration**: 15 min

**Total**: ~4.5 hours

