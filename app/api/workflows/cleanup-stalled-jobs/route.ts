/**
 * API endpoint to trigger stalled job cleanup workflow
 *
 * GET /api/workflows/cleanup-stalled-jobs (Vercel Cron)
 * POST /api/workflows/cleanup-stalled-jobs (Manual trigger)
 *
 * This endpoint triggers a workflow that:
 * 1. Finds jobs stuck in 'processing' state for >30 minutes
 * 2. Marks them as failed
 * 3. Updates associated resources to failed state
 *
 * Authentication:
 * - Vercel Cron: Authorization: Bearer <CRON_SECRET>
 * - Manual: Admin user session
 *
 * Scheduled: Every 10 minutes
 *
 * Returns:
 * {
 *   "success": true,
 *   "totalJobs": 5,
 *   "stalledJobs": 5,
 *   "cleanedJobs": 5,
 *   "failedUpdates": 0,
 *   "errors": []
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupStalledJobsWorkflow } from '@/lib/workflows/cleanup-stalled-jobs/index';
import { requireAdmin } from '@/lib/auth/helpers';

/**
 * Authenticate the request - supports both Vercel Cron and admin users
 */
async function authenticateRequest(request: NextRequest) {
  // Check for Vercel Cron authentication
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Fall back to admin authentication
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute the cleanup workflow
 */
async function executeCleanup(method: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${method} /api/workflows/cleanup-stalled-jobs] Starting cleanup workflow at ${timestamp}`);

  // Start workflow and await result
  const result = await cleanupStalledJobsWorkflow();

  console.log(`[${method} /api/workflows/cleanup-stalled-jobs] Workflow completed:`, {
    success: result.success,
    totalJobs: result.totalJobs,
    stalledJobs: result.stalledJobs,
    cleanedJobs: result.cleanedJobs,
    failedUpdates: result.failedUpdates,
    timestamp,
  });

  return result;
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate request (Vercel Cron or admin)
    const isAuthenticated = await authenticateRequest(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await executeCleanup('GET');
    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/workflows/cleanup-stalled-jobs] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run stalled job cleanup',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate request (Vercel Cron or admin)
    const isAuthenticated = await authenticateRequest(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await executeCleanup('POST');
    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/workflows/cleanup-stalled-jobs] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run stalled job cleanup',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
