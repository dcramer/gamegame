/**
 * Mark Job Failed Step
 *
 * Updates resource status to failed when an error occurs.
 */

'use step';

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { failWorkflowRun } from '@/lib/services/workflow-run-store';

export async function markJobFailedStep(runId: string, resourceId: string, error: string) {
  await db
    .update(resources)
    .set({
      status: 'failed',
      processingStage: 'failed',
      processingMetadata: null,
      currentRunId: null,
      updatedAt: Date.now(),
    })
    .where(eq(resources.id, resourceId));

  await failWorkflowRun(runId, error, {
    status: 'Workflow failed',
    resourceId,
    stage: 'failed',
  });
}
