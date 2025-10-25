import type { Env } from '@/types';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { getDb, resources } from '../lib/db';
import { eq } from 'drizzle-orm';
import type { ResourceJob } from '../lib/jobs/status';

const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

const cleanupLog = (event: string, data: Record<string, unknown>) => {
  console.log(JSON.stringify({ module: 'cleanup-stalled-jobs', event, ...data }));
};

/**
 * Scheduled worker to clean up stalled jobs
 * Runs every 10 minutes to check for jobs stuck in "processing" state
 */
const handler: ExportedHandler<Env> = {
  async scheduled(event, env, _ctx): Promise<void> {
    cleanupLog('cleanup_started', {
      scheduledTime: new Date(event.scheduledTime).toISOString(),
      cron: event.cron
    });

    try {
      // List all jobs from KV with "job:" prefix
      const { keys } = await env.JOB_STATUS_KV.list({ prefix: 'job:' });

      if (keys.length === 0) {
        cleanupLog('no_jobs_found', { count: 0 });
        return;
      }

      cleanupLog('checking_jobs', { count: keys.length });

      const now = Date.now();
      let stalledCount = 0;
      let failedUpdates = 0;

      // Check each job
      for (const key of keys) {
        const jobData = await env.JOB_STATUS_KV.get(key.name, 'json') as ResourceJob | null;

        if (!jobData) {
          cleanupLog('job_not_found', { key: key.name });
          continue;
        }

        // Only check jobs in "processing" state
        if (jobData.status !== 'processing') {
          continue;
        }

        const processingDuration = now - jobData.updatedAt;

        // Check if job has been processing for too long
        if (processingDuration > STALL_THRESHOLD_MS) {
          stalledCount++;

          cleanupLog('stalled_job_detected', {
            jobId: jobData.jobId,
            resourceId: jobData.resourceId,
            gameId: jobData.gameId,
            currentStep: jobData.currentStep,
            processingDuration: Math.round(processingDuration / 1000 / 60), // minutes
            lastUpdated: new Date(jobData.updatedAt).toISOString(),
          });

          try {
            // Mark job as failed in KV
            const updatedJob: ResourceJob = {
              ...jobData,
              status: 'failed',
              error: `Job stalled after ${Math.round(processingDuration / 1000 / 60)} minutes`,
              currentStep: 'Processing timed out',
              updatedAt: now,
              completedAt: now,
            };

            await env.JOB_STATUS_KV.put(
              `job:${jobData.jobId}`,
              JSON.stringify(updatedJob),
              { expirationTtl: 86400 } // Keep for 24 hours
            );

            // Update resource status in D1
            const db = getDb(env.DB);
            await db
              .update(resources)
              .set({
                status: 'failed',
                processingStage: 'failed',
                processingMetadata: null,
                currentJobId: null,
                updatedAt: new Date(),
              })
              .where(eq(resources.id, jobData.resourceId));

            cleanupLog('stalled_job_cleaned', {
              jobId: jobData.jobId,
              resourceId: jobData.resourceId,
            });
          } catch (updateError) {
            failedUpdates++;
            cleanupLog('cleanup_error', {
              jobId: jobData.jobId,
              resourceId: jobData.resourceId,
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
          }
        }
      }

      cleanupLog('cleanup_completed', {
        totalJobs: keys.length,
        stalledJobs: stalledCount,
        failedUpdates,
      });
    } catch (error) {
      cleanupLog('cleanup_failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  },
};

export default handler;
