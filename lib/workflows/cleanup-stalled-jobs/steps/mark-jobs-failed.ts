/**
 * Mark Jobs as Failed Step
 */

import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { StalledJob } from '../../shared/types';

export async function markJobsAsFailed(
  stalledJobs: StalledJob[]
): Promise<{
  cleanedJobs: number;
  failedUpdates: number;
  errors: Array<{ jobId: string; error: string }>;
}> {
  'use step';

  let cleanedJobs = 0;
  let failedUpdates = 0;
  const errors: Array<{ jobId: string; error: string }> = [];

  for (const job of stalledJobs) {
    try {
      const now = Date.now();
      const durationMinutes = Math.round(job.processingDuration / 1000 / 60);

      await db
        .update(jobs)
        .set({
          status: 'failed',
          error: {
            message: `Job stalled after ${durationMinutes} minutes`,
            cause: 'No progress detected - job exceeded 30 minute timeout',
          },
          currentStep: 'Processing timed out',
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.id, job.id));

      await db
        .update(resources)
        .set({
          status: 'failed',
          processingStage: 'failed',
          processingMetadata: null,
          currentJobId: null,
          updatedAt: now,
        })
        .where(eq(resources.id, job.resourceId));

      cleanedJobs++;
      console.log(`[Cleanup] Cleaned stalled job: ${job.id} (resource: ${job.resourceId})`);
    } catch (error) {
      failedUpdates++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ jobId: job.id, error: errorMessage });
      console.error(`[Cleanup] Failed to clean job ${job.id}:`, error);
    }
  }

  console.log(
    `[Cleanup] Cleanup complete: ${cleanedJobs} jobs cleaned, ${failedUpdates} failed updates`
  );

  return { cleanedJobs, failedUpdates, errors };
}
