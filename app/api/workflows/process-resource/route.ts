/**
 * API endpoint to trigger resource processing workflow
 *
 * POST /api/workflows/process-resource
 *
 * Body:
 * {
 *   "resourceId": "resource-id",
 *   "gameId": "game-id",
 *   "gameName": "Game Name",
 *   "name": "Resource Name",
 *   "url"?: "https://...",  // Optional: URL to fetch PDF
 *   "sourceKey"?: "resources/..." // Optional: Blob key if already uploaded
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { processResourceWorkflow } from '@/lib/workflows/process-resource/index';
import { db } from '@/lib/db';
import { resources, jobs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAdmin } from '@/lib/auth/helpers';

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication for workflow endpoint
    await requireAdmin();

    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const fromStage = searchParams.get('from') as 'vision' | 'cleanup' | 'metadata' | 'embed' | null;

    // Validate required fields
    const { resourceId, gameId, gameName, name, url, sourceKey } = body;

    if (!resourceId || !gameId || !gameName || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: resourceId, gameId, gameName, name' },
        { status: 400 }
      );
    }

    if (!url && !sourceKey) {
      return NextResponse.json(
        { error: 'Either url or sourceKey must be provided' },
        { status: 400 }
      );
    }

    // Validate fromStage parameter
    if (fromStage && !['vision', 'cleanup', 'metadata', 'embed'].includes(fromStage)) {
      return NextResponse.json(
        { error: 'Invalid from parameter. Must be one of: vision, cleanup, metadata, embed' },
        { status: 400 }
      );
    }

    // Check if resource exists
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) {
      return NextResponse.json(
        { error: `Resource ${resourceId} not found` },
        { status: 404 }
      );
    }

    // Create job record
    const jobId = nanoid();
    await db.insert(jobs).values({
      id: jobId,
      type: 'process-resource',
      gameId,
      resourceId,
      status: 'pending',
      currentStep: 'Queued for processing',
      progress: 0,
    });

    // Update resource status
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: fromStage || 'ingest',
        currentJobId: jobId,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, resourceId));

    // Trigger workflow asynchronously
    const workflowInput = {
      jobId,
      resourceId,
      gameId,
      gameName,
      name,
      url,
      sourceKey,
      fromStage: fromStage || undefined,
    };

    // Start workflow in background (don't await)
    processResourceWorkflow(workflowInput).catch((error) => {
      console.error('[Workflow] Error:', error);
      // Mark job as failed
      db.update(jobs)
        .set({
          status: 'failed',
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          completedAt: Date.now(),
        })
        .where(eq(jobs.id, jobId))
        .catch((err) => console.error('[Workflow] Failed to update job:', err));
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Resource processing started',
    });
  } catch (error) {
    console.error('[POST /api/workflows/process-resource] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start resource processing',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflows/process-resource?jobId=xxx
 *
 * Check job status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { error: `Job ${jobId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      jobId: job.id,
      resourceId: job.resourceId,
      status: job.status,
      currentStep: job.currentStep,
      progress: job.progress,
      error: job.error,
      createdAt: Number(job.createdAt),
      completedAt: job.completedAt ? Number(job.completedAt) : null,
    });
  } catch (error) {
    console.error('[GET /api/workflows/process-resource] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get job status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
