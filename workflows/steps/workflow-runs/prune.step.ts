/**
 * Workflow Runs Prune Step
 */

'use step';

import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema';
import { and, lte, not, isNull, or } from 'drizzle-orm';

const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STALE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function pruneWorkflowRunsStep() {
  const now = Date.now();
  const completedCutoff = now - COMPLETED_RETENTION_MS;
  const staleCutoff = now - STALE_RETENTION_MS;

  const deleted = await db
    .delete(workflowRuns)
    .where(
      or(
        and(
          not(isNull(workflowRuns.completedAt)),
          lte(workflowRuns.completedAt, completedCutoff)
        ),
        and(
          isNull(workflowRuns.completedAt),
          lte(workflowRuns.updatedAt, staleCutoff)
        )
      )
    )
    .returning({ id: workflowRuns.id });

  return { success: true, deletedCount: deleted.length };
}
