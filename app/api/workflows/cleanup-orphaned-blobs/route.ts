/**
 * API endpoint to trigger orphaned blob cleanup workflow
 *
 * GET /api/workflows/cleanup-orphaned-blobs (Vercel Cron)
 * POST /api/workflows/cleanup-orphaned-blobs (Manual trigger)
 *
 * This endpoint triggers a workflow that:
 * 1. Lists all blobs in storage
 * 2. Compares against database references
 * 3. Deletes blobs that are no longer referenced
 *
 * Authentication:
 * - Vercel Cron: Authorization: Bearer <CRON_SECRET>
 * - Manual: Admin user session
 *
 * Scheduled: Daily at 2 AM UTC (0 2 * * *)
 *
 * Returns:
 * {
 *   "success": true,
 *   "orphanedCount": 10,
 *   "deletedCount": 10,
 *   "failedDeletions": []
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupOrphanedBlobsWorkflow } from '@/lib/workflows/cleanup-orphaned-blobs/index';
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
  console.log(`[${method} /api/workflows/cleanup-orphaned-blobs] Starting cleanup workflow at ${timestamp}`);

  // Start workflow and await result
  const result = await cleanupOrphanedBlobsWorkflow();

  console.log(`[${method} /api/workflows/cleanup-orphaned-blobs] Workflow completed:`, {
    success: result.success,
    orphanedCount: result.orphanedCount,
    deletedCount: result.deletedCount,
    failedCount: result.failedDeletions.length,
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
    console.error('[GET /api/workflows/cleanup-orphaned-blobs] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run orphaned blob cleanup',
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
    console.error('[POST /api/workflows/cleanup-orphaned-blobs] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run orphaned blob cleanup',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
