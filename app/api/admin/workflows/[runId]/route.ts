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
    user,
    { params }: { params: Promise<{ runId: string }> }
  ) => {
    const { runId } = await params;

    try {
      const workflow = await getWorkflowRun(runId);

      return NextResponse.json({
        runId: workflow.runId,
        status: workflow.status,
        workflowName: workflow.workflowName,
        error: workflow.error,
        errorCode: workflow.errorCode,
        createdAt: workflow.createdAt.toISOString(),
        startedAt: workflow.startedAt?.toISOString(),
        completedAt: workflow.completedAt?.toISOString(),
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
