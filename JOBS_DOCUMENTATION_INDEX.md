# Jobs Management Page Documentation Index

Complete analysis and implementation guide for porting the Jobs Management page from Workers app to Next.js 15.

---

## Documentation Files

### 1. JOBS_QUICK_REFERENCE.md (6.7 KB)
**Start here if you want a quick overview**
- What is being ported
- Core data model
- 3 API endpoints needed
- Files to create
- Key features summary
- Implementation order (6 phases)
- Database schema overview
- Key differences from Workers app
- Testing checklist
- Estimated effort: ~4.5 hours

### 2. JOBS_IMPLEMENTATION.md (20 KB)
**Comprehensive implementation guide with detailed specs**
- Data structure & type definitions
- Complete API endpoint specifications with request/response examples
- Features & behavior details:
  - Auto-refresh logic
  - Status badge styling
  - Progress bar implementation
  - Error display
  - Timestamp formatting
  - Action buttons
  - Empty state
  - Toast notifications
- Component structure & architecture
- What needs to be created (file-by-file breakdown)
- 6-phase implementation checklist
- Key implementation details with code patterns
- Migration notes from Workers app
- Testing examples
- File reference summary with absolute paths
- Styling & CSS classes reference

### 3. JOBS_CODE_SNIPPETS.md (24 KB)
**Ready-to-use code - copy and paste into your project**

Complete, tested code for:
1. Utility Functions
   - `lib/utils/format-date.ts` - formatDate(), formatDuration()
   - `lib/utils/jobs.ts` - getStatusVariant(), isActiveJob(), canCancel(), canRetry()

2. UI Components
   - `components/ui/badge.tsx` - Status badge component
   - `components/ui/tooltip.tsx` - Tooltip components

3. API Routes (3 endpoints)
   - `app/api/admin/jobs/route.ts` - GET endpoint
   - `app/api/admin/jobs/[jobId]/cancel/route.ts` - POST cancel
   - `app/api/admin/jobs/[jobId]/retry/route.ts` - POST retry

4. Page Components
   - `app/admin/jobs/page.tsx` - Server component
   - `app/admin/jobs/jobs-client.tsx` - Client component with all logic

5. Database type updates
6. Toast notification integration examples

Includes implementation checklist at the end.

### 4. JOBS_MANAGEMENT_ANALYSIS.md (24 KB)
**Deep technical analysis of the original implementation**
- Original file location and structure
- Page component analysis (hook-by-hook)
- Formatter functions analysis
- Status badge styling logic
- Auto-refresh implementation
- Handlers (cancel/retry) with detailed flow
- API endpoint analysis (from workers app)
- Database queries
- Type system & schemas
- Key architectural decisions

This file is useful for understanding how the original implementation works if you need to customize anything.

---

## How to Use These Docs

### For Quick Start (30 minutes)
1. Read JOBS_QUICK_REFERENCE.md
2. Skim through JOBS_CODE_SNIPPETS.md to understand structure
3. Start implementing following the checklist

### For Detailed Implementation (4-5 hours)
1. Read JOBS_QUICK_REFERENCE.md for overview
2. Read JOBS_IMPLEMENTATION.md sections 2-4 for API/component specs
3. Use JOBS_CODE_SNIPPETS.md for actual implementation
4. Follow JOBS_IMPLEMENTATION.md Phase 1-6 checklist
5. Reference JOBS_IMPLEMENTATION.md section 7 for implementation patterns

### For Understanding Original Code (troubleshooting)
1. Read JOBS_MANAGEMENT_ANALYSIS.md for deep analysis
2. Reference source files:
   - `/Users/dcramer/src/gamegame/workers/app/routes/admin.jobs.tsx` (347 lines)
   - `/Users/dcramer/src/gamegame/workers/src/routes/api/resources.ts`

---

## Key Files & Paths

### Source (Workers App)
- **Page**: `/Users/dcramer/src/gamegame/workers/app/routes/admin.jobs.tsx`
- **API**: `/Users/dcramer/src/gamegame/workers/src/routes/api/resources.ts`
- **Schemas**: `/Users/dcramer/src/gamegame/workers/src/routes/api/schemas.ts`
- **UI**: `/Users/dcramer/src/gamegame/workers/app/components/ui/badge.tsx`

### Target (Next.js App)
- **Pages**: `app/admin/jobs/page.tsx` and `app/admin/jobs/jobs-client.tsx`
- **API**: `app/api/admin/jobs/*`
- **Components**: `components/ui/badge.tsx` and `components/ui/tooltip.tsx`
- **Utils**: `lib/utils/format-date.ts` and `lib/utils/jobs.ts`
- **Schema**: `lib/db/schema/jobs.ts` (already exists)

---

## Data Model at a Glance

```typescript
interface JobWithDetails {
  jobId: string;
  resourceId: string;
  gameId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;              // 0-100%
  currentStep?: string;          // INGEST, VISION, CLEANUP, METADATA, EMBED, FINALIZE
  error?: string;
  createdAt: number;             // Unix milliseconds
  updatedAt: number;
  completedAt?: number;
  resourceName?: string;         // From database join
  gameName?: string;             // From database join
}
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/admin/jobs` | GET | List all jobs with pagination | Admin |
| `/api/admin/jobs/[jobId]/cancel` | POST | Cancel pending/processing job | Admin |
| `/api/admin/jobs/[jobId]/retry` | POST | Retry failed job | Admin |

---

## Implementation Phases

1. **UI Components & Utilities** (1 hour)
   - Badge, Tooltip components
   - formatDate, formatDuration, getStatusVariant utilities

2. **API Routes** (1.5 hours)
   - GET /api/admin/jobs
   - POST /api/admin/jobs/[jobId]/cancel
   - POST /api/admin/jobs/[jobId]/retry

3. **Database Integration** (0.5 hours)
   - Verify schema exists
   - Create database queries

4. **Page Components** (1 hour)
   - app/admin/jobs/page.tsx
   - app/admin/jobs/jobs-client.tsx
   - Auto-refresh logic
   - State management

5. **Testing** (1 hour)
   - API endpoint tests
   - Component tests

6. **Navigation & Integration** (0.25 hours)
   - Add links from admin page

**Total Estimated Time: 4.5-5 hours**

---

## Quick Feature List

Auto-refresh every 5 seconds when jobs are processing
Progress bars showing 0-100% completion
Status badges with color-coding
Error message display with truncation
Relative date formatting ("5m ago", "just now")
Duration formatting ("2m 30s", "1h 45m")
Cancel button for pending/processing jobs
Retry button for failed jobs
Confirmation dialogs for destructive actions
Empty state when no jobs exist
Toast notifications for success/error
Admin-only access

---

## Testing Checklist

Basic Functionality:
- [ ] GET /api/admin/jobs returns paginated list
- [ ] GET /api/admin/jobs requires admin auth
- [ ] Non-admin users get 401 Unauthorized

Cancel Functionality:
- [ ] POST cancel works for pending jobs
- [ ] POST cancel works for processing jobs
- [ ] POST cancel fails (409) for completed jobs
- [ ] POST cancel fails (409) for already-failed jobs

Retry Functionality:
- [ ] POST retry works for failed jobs
- [ ] POST retry fails (400) for pending jobs
- [ ] POST retry fails (400) for processing jobs
- [ ] POST retry fails (400) for completed jobs

UI Behavior:
- [ ] Auto-refresh only triggers when active jobs exist
- [ ] Auto-refresh stops when no active jobs
- [ ] Cancel button disabled while canceling
- [ ] Retry button disabled while retrying
- [ ] Progress bars update correctly
- [ ] Status badges show correct colors
- [ ] Error messages truncate at 50 chars
- [ ] Tooltips appear on button hover
- [ ] Relative dates format correctly
- [ ] Duration calculations are accurate
- [ ] Empty state displays when no jobs
- [ ] Table links navigate correctly

---

## Common Questions

**Q: Where does job data come from?**
A: The `jobs` table in PostgreSQL (lib/db/schema/jobs.ts). This is different from the Workers app which used Cloudflare KV.

**Q: How often does the page refresh?**
A: Every 5 seconds when there are jobs with status 'pending' or 'processing'. It stops refreshing when all jobs are completed/failed.

**Q: What happens when I cancel a job?**
A: The job status changes to 'failed' with processingStage 'cancelled'. The related resource status is also updated. The job no longer processes.

**Q: What happens when I retry a job?**
A: A new job is created with the same resourceId. The resource status changes to 'processing' with the new job ID. The retry starts from the same stage the previous job failed at.

**Q: Do I need to update any database migrations?**
A: No, the `jobs` table schema already exists in lib/db/schema/jobs.ts.

**Q: What about toast notifications?**
A: Use your existing toast implementation. The code snippets have TODO comments for where to add toasts. Check what's already available in components or hooks.

---

## File Sizes

- JOBS_QUICK_REFERENCE.md: 6.7 KB (252 lines)
- JOBS_IMPLEMENTATION.md: 20 KB (640 lines)
- JOBS_CODE_SNIPPETS.md: 24 KB (841 lines)
- JOBS_MANAGEMENT_ANALYSIS.md: 24 KB (832 lines)
- **Total: 74.7 KB of documentation**

---

## Helpful Terminal Commands

View original page:
```bash
cat /Users/dcramer/src/gamegame/workers/app/routes/admin.jobs.tsx
```

View original API:
```bash
grep -A 100 "get('/jobs'" /Users/dcramer/src/gamegame/workers/src/routes/api/resources.ts
```

Check job schema:
```bash
cat /Users/dcramer/src/gamegame/lib/db/schema/jobs.ts
```

Check existing admin layout:
```bash
cat /Users/dcramer/src/gamegame/app/admin/layout.tsx
```

---

## Implementation Strategy

1. Start with JOBS_QUICK_REFERENCE.md to get the big picture (5 min)
2. Copy-paste utilities from JOBS_CODE_SNIPPETS.md into your project (5 min)
3. Copy-paste UI components from JOBS_CODE_SNIPPETS.md (5 min)
4. Implement API routes one by one from JOBS_CODE_SNIPPETS.md (30 min)
5. Implement page components from JOBS_CODE_SNIPPETS.md (30 min)
6. Integrate with existing toast/notification system (15 min)
7. Add navigation links (5 min)
8. Run through testing checklist (60 min)

Total: ~2.5-3 hours of actual coding (plus 1.5-2 hours testing)

---

## Success Criteria

When complete, you should have:
- A fully functional Jobs Management page at `/admin/jobs`
- Real-time status updates every 5 seconds
- Ability to cancel pending/processing jobs
- Ability to retry failed jobs
- Proper error handling and user feedback
- Full admin authentication
- Passing test suite

---

## Need Help?

1. **Understanding the original?** → Read JOBS_MANAGEMENT_ANALYSIS.md
2. **Exact code to use?** → Copy from JOBS_CODE_SNIPPETS.md
3. **API specifications?** → See JOBS_IMPLEMENTATION.md section 2
4. **Component structure?** → See JOBS_IMPLEMENTATION.md section 4
5. **Quick overview?** → Read JOBS_QUICK_REFERENCE.md

---

Last Updated: November 5, 2025
Source Analysis Date: November 5, 2025
Analysis Tool: Claude Code with Haiku 4.5

