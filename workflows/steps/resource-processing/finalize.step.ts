/**
 * FINALIZE Step - Mark resource as ready
 */

'use step';

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '@/workflows/support/types';
import { completeWorkflowRun } from '@/lib/services/workflow-run-store';

export async function runFinalizeStage(input: ProcessResourceInput) {
  try {
    await db
      .update(resources)
      .set({
        status: 'ready',
        processingStage: 'ready',
        processingMetadata: null,
        currentRunId: null,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    await completeWorkflowRun(input.runId, {
      status: 'Processing complete',
      resourceId: input.resourceId,
      stage: 'finalize',
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
