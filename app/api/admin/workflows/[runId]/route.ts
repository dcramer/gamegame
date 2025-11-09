import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware';
import { getWorkflowRun } from '@/lib/services/workflows';

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
