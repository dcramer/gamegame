import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware';
import { getWorkflowRun, cancelWorkflowRun } from '@/lib/services/workflows';
import { db } from '@/lib/db';
import { workflowRuns, resources } from '@/lib/db/schema';
import { or, eq } from 'drizzle-orm';

/**
 * GET /api/admin/workflows/:runId
 *
 * Get workflow status by run ID
 * Admin-only endpoint
 */
export const GET = withAdmin(
  async (
    request: NextRequest,
    _user,
    context?: { params: Promise<{ runId: string }> }
  ) => {
    if (!context) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    const { runId } = await context.params;

    try {
      const workflow = await getWorkflowRun(runId);
      const [workflowRow] = await db
        .select()
        .from(workflowRuns)
        .where(
          or(
            eq(workflowRuns.id, runId),
            eq(workflowRuns.externalRunId, runId)
          )
        )
        .limit(1);
      const output = workflow.output;
      const outputIsObject =
        output && typeof output === 'object' && !Array.isArray(output);
      const outputIndicatesFailure =
        workflow.status === 'completed' &&
        outputIsObject &&
        Object.prototype.hasOwnProperty.call(output, 'success') &&
        (output as Record<string, unknown>).success === false;
      const derivedStatus = outputIndicatesFailure ? 'failed' : workflow.status;
      const outputError =
        outputIsObject && typeof (output as Record<string, unknown>).error === 'string'
          ? ((output as Record<string, unknown>).error as string)
          : undefined;
      const errorMessage = outputIndicatesFailure
        ? outputError || workflow.error
        : workflow.error;

      return NextResponse.json({
        runId: workflow.runId,
        status: derivedStatus,
        workflowName: workflow.workflowName,
        error: errorMessage,
        errorCode: workflow.errorCode,
        createdAt: workflow.createdAt.toISOString(),
        startedAt: workflow.startedAt?.toISOString(),
        completedAt: workflow.completedAt?.toISOString(),
        output,
        input: workflow.input,
        metadata: workflowRow?.metadata ?? null,
        resourceId: workflowRow?.resourceId ?? null,
        attachmentId: workflowRow?.attachmentId ?? null,
        gameId: workflowRow?.gameId ?? null,
        localRunId: workflowRow?.id ?? null,
      });
    } catch (error) {
      // Workflow not found
      if (error instanceof Error && error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      console.error(`Failed to fetch workflow ${runId}:`, error);
      return NextResponse.json(
        { error: 'Failed to fetch workflow status' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/admin/workflows/:runId
 *
 * Cancel a workflow run
 * Admin-only endpoint
 */
export const DELETE = withAdmin(
  async (
    request: NextRequest,
    _user,
    context?: { params: Promise<{ runId: string }> }
  ) => {
    if (!context) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    const { runId } = await context.params;

    try {
      // Find the workflow run in our database
      const [workflowRow] = await db
        .select()
        .from(workflowRuns)
        .where(
          or(
            eq(workflowRuns.id, runId),
            eq(workflowRuns.externalRunId, runId)
          )
        )
        .limit(1);

      if (!workflowRow) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      // Cancel the workflow using the external run ID
      const externalRunId = workflowRow.externalRunId ?? workflowRow.id;
      await cancelWorkflowRun(externalRunId);

      // Update our database record
      await db
        .update(workflowRuns)
        .set({
          status: 'cancelled',
          completedAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            ...(workflowRow.metadata ?? {}),
            status: 'Cancelled by user',
          },
        })
        .where(eq(workflowRuns.id, workflowRow.id));

      // If this is a resource processing workflow, update the resource status
      if (workflowRow.workflowName === 'process-resource' && workflowRow.resourceId) {
        await db
          .update(resources)
          .set({
            status: 'ready',
            processingStage: 'ready',
            currentRunId: null,
            processingMetadata: null,
            updatedAt: Date.now(),
          })
          .where(eq(resources.id, workflowRow.resourceId));
      }

      return NextResponse.json({
        success: true,
        message: 'Workflow cancelled',
      });
    } catch (error) {
      console.error(`Failed to cancel workflow ${runId}:`, error);
      return NextResponse.json(
        { error: 'Failed to cancel workflow' },
        { status: 500 }
      );
    }
  }
);

