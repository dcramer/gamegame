# Scheduled Jobs

This document describes the automated scheduled jobs configured for the GameGame application using Vercel Cron.

## Overview

GameGame uses Vercel Cron to automate system maintenance tasks. These jobs run in production on a scheduled basis to keep the application clean and healthy.

## Configuration

Scheduled jobs are configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/workflows/cleanup-stalled-jobs",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/workflows/cleanup-orphaned-blobs",
      "schedule": "0 2 * * *"
    }
  ]
}
```

## Jobs

### 1. Cleanup Stalled Jobs

**Endpoint:** `/api/workflows/cleanup-stalled-jobs`
**Schedule:** Every 10 minutes (`*/10 * * * *`)
**Purpose:** Marks jobs stuck in "processing" state for more than 30 minutes as failed

**What it does:**
1. Scans all resource processing jobs
2. Identifies jobs in "processing" state for >30 minutes
3. Marks stalled jobs as "failed" in the job status store
4. Updates associated resources to failed state in the database
5. Logs all actions for monitoring

**Why it's needed:**
- Prevents jobs from being stuck indefinitely
- Frees up resources for new processing attempts
- Provides visibility into processing failures
- Allows users to retry failed jobs

**Returns:**
```json
{
  "success": true,
  "totalJobs": 50,
  "stalledJobs": 2,
  "cleanedJobs": 2,
  "failedUpdates": 0,
  "errors": []
}
```

### 2. Cleanup Orphaned Blobs

**Endpoint:** `/api/workflows/cleanup-orphaned-blobs`
**Schedule:** Daily at 2 AM UTC (`0 2 * * *`)
**Purpose:** Removes blob storage files that are no longer referenced in the database

**What it does:**
1. Lists all blobs in Vercel Blob storage (or local filesystem)
2. Queries database for all blob references (games, resources, attachments)
3. Identifies blobs not referenced anywhere in the database
4. Deletes orphaned blobs to free up storage
5. Logs deletion results for monitoring

**Why it's needed:**
- Prevents storage bloat from failed uploads
- Removes files from deleted resources
- Reduces storage costs
- Keeps blob storage in sync with database

**Returns:**
```json
{
  "success": true,
  "orphanedCount": 15,
  "deletedCount": 15,
  "failedDeletions": []
}
```

## Authentication

Scheduled jobs are protected by two authentication methods:

1. **Vercel Cron Authentication** (production)
   - Vercel automatically adds `Authorization: Bearer <CRON_SECRET>` header
   - Set `CRON_SECRET` environment variable in Vercel dashboard
   - Generate secret: `openssl rand -base64 32`

2. **Admin Authentication** (manual triggering)
   - Requires admin user session
   - Used for manual testing and one-off executions
   - Accessible via admin panel or API calls

## Manual Triggering

You can manually trigger these jobs for testing or one-off execution:

### Via cURL

```bash
# Cleanup stalled jobs
curl -X POST https://gamegame.ai/api/workflows/cleanup-stalled-jobs \
  -H "Cookie: authjs.session-token=<your-session-token>"

# Cleanup orphaned blobs
curl -X POST https://gamegame.ai/api/workflows/cleanup-orphaned-blobs \
  -H "Cookie: authjs.session-token=<your-session-token>"
```

### Via Admin Panel

Navigate to the admin panel (when implemented) to trigger jobs manually.

## Monitoring

### Vercel Dashboard

1. Navigate to your project in Vercel dashboard
2. Go to "Logs" tab
3. Filter by function name to see cron execution logs
4. Look for entries like:
   - `[GET /api/workflows/cleanup-stalled-jobs] Starting cleanup workflow`
   - `[GET /api/workflows/cleanup-stalled-jobs] Workflow completed`

### Log Output

Each job logs:
- **Start timestamp:** When the job began execution
- **Result summary:** Success/failure and counts
- **Detailed operations:** Individual items processed
- **Errors:** Any failures that occurred during execution

Example log output:
```
[GET /api/workflows/cleanup-stalled-jobs] Starting cleanup workflow at 2025-01-15T02:00:00.000Z
[GET /api/workflows/cleanup-stalled-jobs] Workflow completed: {
  success: true,
  totalJobs: 50,
  stalledJobs: 2,
  cleanedJobs: 2,
  failedUpdates: 0,
  timestamp: "2025-01-15T02:00:00.000Z"
}
```

### Alerting

Consider setting up alerts for:
- Failed job executions (success: false)
- High stalled job counts (indicates processing issues)
- High orphaned blob counts (indicates cleanup issues)
- Failed deletions or updates

## Disabling Jobs

To temporarily disable a scheduled job:

1. **Option 1: Remove from vercel.json**
   ```json
   {
     "crons": [
       // Comment out or remove the job you want to disable
     ]
   }
   ```

2. **Option 2: Update schedule to far future**
   ```json
   {
     "crons": [
       {
         "path": "/api/workflows/cleanup-stalled-jobs",
         "schedule": "0 0 1 1 *"  // Run once a year
       }
     ]
   }
   ```

3. Deploy changes to Vercel

## Troubleshooting

### Jobs Not Running

**Check:**
- Vercel plan supports cron jobs (Pro or Enterprise required)
- `CRON_SECRET` is set in Vercel environment variables
- `vercel.json` is committed to repository
- Logs show no authentication errors

**Fix:**
1. Verify Vercel plan in dashboard
2. Set `CRON_SECRET`: `npx vercel env add CRON_SECRET`
3. Redeploy: `npx vercel --prod`

### Authentication Failures

**Symptom:** Logs show "Unauthorized" errors

**Fix:**
1. Generate new secret: `openssl rand -base64 32`
2. Update in Vercel: `npx vercel env add CRON_SECRET production`
3. Redeploy application

### High Stalled Job Counts

**Symptom:** Many jobs timing out

**Possible causes:**
- API rate limits (OpenAI, Mistral)
- Network issues
- Database connection problems
- Memory/timeout limits

**Fix:**
1. Check Vercel function logs for errors
2. Review recent failed jobs in database
3. Increase function timeout if needed
4. Optimize resource processing workflow

### Storage Not Cleaning Up

**Symptom:** Blob storage growing despite cleanup

**Check:**
1. Orphaned blob cleanup logs
2. Failed deletions in response
3. Blob storage permissions

**Fix:**
1. Verify `BLOB_READ_WRITE_TOKEN` has delete permissions
2. Check for errors in deletion step
3. Manually verify blob references in database

## Development

Cron jobs do NOT run in development mode. To test locally:

1. **Set CRON_SECRET in .env:**
   ```bash
   CRON_SECRET=your-test-secret
   ```

2. **Start dev server:**
   ```bash
   pnpm dev
   ```

3. **Trigger manually:**
   ```bash
   curl -X GET http://localhost:3000/api/workflows/cleanup-stalled-jobs \
     -H "Authorization: Bearer your-test-secret"
   ```

## Limits

Vercel Cron has these limits:

- **Maximum jobs:** 100 per project
- **Minimum interval:** 1 minute
- **Maximum execution time:** Based on Vercel function timeout (10s hobby, 60s pro, 900s enterprise)
- **Availability:** Pro and Enterprise plans only

## Future Jobs

Consider adding scheduled jobs for:

- **Database backups:** Daily database exports
- **Analytics aggregation:** Daily/weekly metrics rollups
- **Embedding updates:** Re-embed resources when model improves
- **Cache warming:** Pre-populate frequently accessed data
- **Health checks:** Periodic system health monitoring
- **Notification digests:** Daily/weekly user summaries

## References

- [Vercel Cron Documentation](https://vercel.com/docs/cron-jobs)
- [Vercel Cron Syntax](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-syntax)
- [Vercel Function Limits](https://vercel.com/docs/functions/limits)
