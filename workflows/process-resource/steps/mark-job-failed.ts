/**
 * Mark Job Failed Step
 *
 * Updates job and resource status to failed when an error occurs.
 */

import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function markJobFailedStep(jobId: string, resourceId: string, error: string) {
  'use step';

  await db
    .update(jobs)
    .set({
      status: 'failed',
      error: { message: error },
      completedAt: Date.now(),
    })
    .where(eq(jobs.id, jobId));

  await db
    .update(resources)
    .set({
      status: 'failed',
      processingStage: 'failed',
      processingMetadata: null,
      currentJobId: null,
      updatedAt: Date.now(),
    })
    .where(eq(resources.id, resourceId));
}
