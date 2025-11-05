/**
 * API endpoint to trigger orphaned blob cleanup workflow
 *
 * POST /api/workflows/cleanup-orphaned-blobs
 *
 * This endpoint triggers a workflow that:
 * 1. Lists all blobs in storage
 * 2. Compares against database references
 * 3. Deletes blobs that are no longer referenced
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
import { cleanupOrphanedBlobsWorkflow } from '@/lib/workflows/cleanup-orphaned-blobs';
import { requireAdmin } from '@/lib/auth/helpers';

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    console.log('[POST /api/workflows/cleanup-orphaned-blobs] Starting cleanup workflow');

    // Start workflow and await result
    const result = await cleanupOrphanedBlobsWorkflow();

    console.log('[POST /api/workflows/cleanup-orphaned-blobs] Workflow completed:', {
      success: result.success,
      orphanedCount: result.orphanedCount,
      deletedCount: result.deletedCount,
      failedCount: result.failedDeletions.length,
    });

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
