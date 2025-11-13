import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema';
import { getWorkflowRun } from '@/lib/services/workflows';
import { desc, inArray, isNull, or } from 'drizzle-orm';

export const GET = withAdmin(async (request: NextRequest) => {
  const url = new URL(request.url);
  const runIds = url.searchParams.getAll('runId');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(100, Math.max(1, Number(limitParam))) : 20;

  let rows;

  if (runIds.length > 0) {
    rows = await db
      .select()
      .from(workflowRuns)
      .where(
        or(
          inArray(workflowRuns.id, runIds),
          inArray(workflowRuns.externalRunId, runIds)
        )
      );
  } else {
    rows = await db
      .select()
      .from(workflowRuns)
      .where(isNull(workflowRuns.completedAt))
      .orderBy(desc(workflowRuns.updatedAt))
      .limit(limit);
  }

  const results = [];

  for (const row of rows) {
    try {
      const workflow = await getWorkflowRun(row.externalRunId ?? row.id);
      results.push({
        runId: workflow.runId,
        status: workflow.status,
        workflowName: workflow.workflowName,
        error: workflow.error,
        errorCode: workflow.errorCode,
        createdAt: workflow.createdAt?.toISOString(),
        startedAt: workflow.startedAt?.toISOString(),
        completedAt: workflow.completedAt?.toISOString(),
        output: workflow.output,
        input: workflow.input,
        metadata: row.metadata,
        resourceId: row.resourceId,
        attachmentId: row.attachmentId,
        gameId: row.gameId,
        localRunId: row.id,
      });
    } catch (error) {
      // If the workflow no longer exists in the Vercel store, skip it.
      console.warn('[admin/workflows] Missing workflow run', row.id, error);
    }
  }

  return NextResponse.json(results);
});
