import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs, resources, games } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/helpers';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { processResourceWorkflow } from '@/workflows/process-resource/index';

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { jobId } = await params;

    // Get the failed job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Only allow retrying failed or cancelled jobs
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Only failed or cancelled jobs can be retried' },
        { status: 400 }
      );
    }

    // Get resource details
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, job.resourceId))
      .limit(1);

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Get game details
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, job.gameId))
      .limit(1);

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Create new job record
    const newJobId = nanoid();
    await db.insert(jobs).values({
      id: newJobId,
      type: 'process-resource',
      gameId: job.gameId,
      resourceId: job.resourceId,
      status: 'pending',
      currentStep: 'Queued for retry',
      progress: 0,
    });

    // Update resource status
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: 'ingest', // Start from beginning on retry
        currentJobId: newJobId,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, job.resourceId));

    // Trigger workflow asynchronously
    const workflowInput = {
      jobId: newJobId,
      resourceId: resource.id,
      gameId: resource.gameId,
      gameName: game.name,
      name: resource.name,
      url: resource.url,
      sourceKey: undefined, // Will fetch from URL
    };

    // Start workflow in background (don't await)
    processResourceWorkflow(workflowInput).catch((error) => {
      console.error('[Retry Workflow] Error:', error);
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
        .where(eq(jobs.id, newJobId))
        .catch((err) => console.error('[Retry Workflow] Failed to update job:', err));
    });

    return NextResponse.json({
      success: true,
      jobId: newJobId,
      message: 'Job retrying from beginning',
    });
  } catch (error) {
    console.error('Error retrying job:', error);

    // Check if it's an authentication error
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to retry job' },
      { status: 500 }
    );
  }
}
