/**
 * API endpoint to trigger stalled job cleanup workflow
 *
 * POST /api/workflows/cleanup-stalled-jobs
 *
 * This endpoint triggers a workflow that:
 * 1. Finds jobs stuck in 'processing' state for >30 minutes
 * 2. Marks them as failed
 * 3. Updates associated resources to failed state
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
import { cleanupStalledJobsWorkflow } from '@/lib/workflows/cleanup-stalled-jobs';
import { requireAdmin } from '@/lib/auth/helpers';

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    console.log('[POST /api/workflows/cleanup-stalled-jobs] Starting cleanup workflow');

    // Start workflow and await result
    const result = await cleanupStalledJobsWorkflow();

    console.log('[POST /api/workflows/cleanup-stalled-jobs] Workflow completed:', {
      success: result.success,
      totalJobs: result.totalJobs,
      stalledJobs: result.stalledJobs,
      cleanedJobs: result.cleanedJobs,
      failedUpdates: result.failedUpdates,
    });

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
