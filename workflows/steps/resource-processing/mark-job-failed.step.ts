/**
 * Mark Job Failed Step
 *
 * Updates resource status to failed when an error occurs.
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function markJobFailedStep(runId: string, resourceId: string, error: string) {
  'use step';

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
}
