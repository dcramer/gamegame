/**
 * FINALIZE Step - Mark resource as ready
 */

import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '../../shared/types';

export async function runFinalizeStage(input: ProcessResourceInput) {
  'use step';

  try {
    await db
      .update(resources)
      .set({
        status: 'ready',
        processingStage: 'ready',
        processingMetadata: null,
        currentJobId: null,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        status: 'completed',
        currentStep: 'Processing complete',
        progress: 100,
        completedAt: Date.now(),
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
