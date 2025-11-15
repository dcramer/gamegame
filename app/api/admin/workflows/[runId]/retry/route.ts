import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware';
import { db } from '@/lib/db';
import { workflowRuns, resources } from '@/lib/db/schema';
import { or, eq } from 'drizzle-orm';
import { reprocessResource } from '@/lib/services/reprocess';

/**
 * POST /api/admin/workflows/:runId/retry
 *
 * Retry a failed workflow
 * Admin-only endpoint
 */
export const POST = withAdmin(
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

      // Only allow retry for failed workflows
      if (workflowRow.status !== 'failed') {
        return NextResponse.json(
          { error: 'Only failed workflows can be retried' },
          { status: 400 }
        );
      }

      // Handle different workflow types
      if (workflowRow.workflowName === 'process-resource' && workflowRow.resourceId) {
        // Retry resource processing
        const result = await reprocessResource({
          resourceId: workflowRow.resourceId,
        });

        return NextResponse.json({
          success: true,
          message: 'Workflow retried',
          runId: result.runId,
        });
      }

      // For other workflow types, we need to add retry logic
      return NextResponse.json(
        { error: 'Retry not implemented for this workflow type' },
        { status: 501 }
      );
    } catch (error) {
      console.error(`Failed to retry workflow ${runId}:`, error);
      return NextResponse.json(
        { error: 'Failed to retry workflow' },
        { status: 500 }
      );
    }
  }
);
