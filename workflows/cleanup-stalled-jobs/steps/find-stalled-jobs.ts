/**
 * Find Stalled Jobs Step
 */

import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import type { StalledJob } from '../../shared/types';

const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function findStalledJobs(): Promise<StalledJob[]> {
  'use step';

  try {
    const now = Date.now();
    const stallThreshold = now - STALL_THRESHOLD_MS;

    const processingJobs = await db
      .select({
        id: jobs.id,
        resourceId: jobs.resourceId,
        gameId: jobs.gameId,
        currentStep: jobs.currentStep,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'processing'),
          lt(jobs.updatedAt, stallThreshold)
        )
      )
      .execute();

    const stalledJobs: StalledJob[] = processingJobs.map((job) => ({
      id: job.id,
      resourceId: job.resourceId,
      gameId: job.gameId,
      currentStep: job.currentStep,
      updatedAt: job.updatedAt,
      processingDuration: now - job.updatedAt,
    }));

    console.log(`[Cleanup] Found ${stalledJobs.length} stalled jobs`);

    for (const job of stalledJobs) {
      const durationMinutes = Math.round(job.processingDuration / 1000 / 60);
      console.log(
        `[Cleanup] Stalled job: ${job.id} (resource: ${job.resourceId}, ` +
          `duration: ${durationMinutes} minutes, step: ${job.currentStep || 'unknown'})`
      );
    }

    return stalledJobs;
  } catch (error) {
    console.error('[Cleanup] Error finding stalled jobs:', error);
    throw error;
  }
}
