import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resources, games } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/helpers';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { processResourceWorkflow } from '@/workflows/process-resource/index';
import { getWorkflowRun } from '@/lib/services/workflows';

type Params = {
  params: Promise<{
    runId: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { runId } = await params;

    // Get the workflow run
    const run = await getWorkflowRun(runId);

    if (!run) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Only allow retrying failed or cancelled jobs
    if (run.status !== 'failed' && run.status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Only failed or cancelled jobs can be retried' },
        { status: 400 }
      );
    }

    // Extract resource and game IDs from workflow input
    const input = run.input[0] as any;
    if (!input?.resourceId || !input?.gameId) {
      return NextResponse.json(
        { error: 'Invalid workflow data' },
        { status: 400 }
      );
    }

    // Get resource details
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, input.resourceId))
      .limit(1);

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Get game details
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.gameId))
      .limit(1);

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Create new job ID
    const newJobId = nanoid();

    // Update resource status
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: 'ingest', // Start from beginning on retry
        currentRunId: newJobId,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    // Trigger workflow asynchronously
    const workflowInput = {
      runId: newJobId,
      resourceId: resource.id,
      gameId: resource.gameId,
      gameName: game.name,
      name: resource.name,
      url: resource.url,
    };

    // Start workflow in background (don't await)
    processResourceWorkflow(workflowInput).catch((error) => {
      console.error('[Retry Workflow] Error:', error);
      // Mark resource as failed
      db.update(resources)
        .set({
          status: 'failed',
          processingStage: 'failed',
          processingMetadata: null,
          currentRunId: null,
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, input.resourceId))
        .catch((err) => console.error('[Retry Workflow] Failed to update resource:', err));
    });

    return NextResponse.json({
      success: true,
      runId: newJobId,
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
