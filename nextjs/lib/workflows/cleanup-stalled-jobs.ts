/**
 * Vercel Workflow for cleaning up stalled jobs
 *
 * This workflow identifies jobs that have been stuck in 'processing' state
 * for more than 30 minutes and marks them as failed. This prevents:
 * - Resources being stuck in processing state indefinitely
 * - Jobs that crashed without updating their status
 * - Database bloat from zombie jobs
 *
 * Ported from: workers/src/workers/cleanup-stalled-jobs.ts
 */

import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';

// ==========================================
// Types
// ==========================================

export interface CleanupStalledJobsResult {
  success: boolean;
  totalJobs: number;
  stalledJobs: number;
  cleanedJobs: number;
  failedUpdates: number;
  errors: Array<{ jobId: string; error: string }>;
}

interface StalledJob {
  id: string;
  resourceId: string;
  gameId: string;
  currentStep: string | null;
  processingDuration: number; // milliseconds
  updatedAt: number;
}

// ==========================================
// Configuration
// ==========================================

const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ==========================================
// Main Workflow
// ==========================================

export async function cleanupStalledJobsWorkflow(): Promise<CleanupStalledJobsResult> {
  'use workflow';

  // Step 1: Find stalled jobs
  const stalledJobs = await findStalledJobs();

  if (stalledJobs.length === 0) {
    return {
      success: true,
      totalJobs: 0,
      stalledJobs: 0,
      cleanedJobs: 0,
      failedUpdates: 0,
      errors: [],
    };
  }

  // Step 2: Mark jobs as failed
  const cleanupResult = await markJobsAsFailed(stalledJobs);

  return {
    success: cleanupResult.failedUpdates === 0,
    totalJobs: stalledJobs.length,
    stalledJobs: stalledJobs.length,
    cleanedJobs: cleanupResult.cleanedJobs,
    failedUpdates: cleanupResult.failedUpdates,
    errors: cleanupResult.errors,
  };
}

// ==========================================
// Step 1: Find Stalled Jobs
// ==========================================

async function findStalledJobs(): Promise<StalledJob[]> {
  'use step';

  try {
    const now = Date.now();
    const stallThreshold = now - STALL_THRESHOLD_MS;

    // Query jobs in 'processing' state that haven't been updated in 30+ minutes
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

    // Log details of stalled jobs
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

// ==========================================
// Step 2: Mark Jobs as Failed
// ==========================================

async function markJobsAsFailed(
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

      // Update job status to failed
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

      // Update resource status to failed
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
