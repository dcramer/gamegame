import type { KVNamespace } from '@cloudflare/workers-types';
import { nanoid } from 'nanoid';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ResourceJob {
  jobId: string;
  resourceId: string;
  gameId: string;
  status: JobStatus;
  progress: number; // 0-100
  currentStep?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Create a new job in KV store
 */
export async function createJob(
  kv: KVNamespace,
  resourceId: string,
  gameId: string
): Promise<string> {
  const jobId = nanoid();
  const job: ResourceJob = {
    jobId,
    resourceId,
    gameId,
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.put(`job:${jobId}`, JSON.stringify(job), {
    expirationTtl: 86400, // 24 hours
  });

  return jobId;
}

/**
 * Update job status/progress
 */
export async function updateJob(
  kv: KVNamespace,
  jobId: string,
  updates: Partial<Omit<ResourceJob, 'jobId' | 'resourceId' | 'gameId' | 'createdAt'>>
): Promise<void> {
  const existing = await kv.get(`job:${jobId}`, 'json') as ResourceJob | null;
  if (!existing) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const updated: ResourceJob = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await kv.put(`job:${jobId}`, JSON.stringify(updated), {
    expirationTtl: 86400,
  });
}

/**
 * Get job status
 */
export async function getJob(
  kv: KVNamespace,
  jobId: string
): Promise<ResourceJob | null> {
  return kv.get(`job:${jobId}`, 'json');
}

/**
 * Delete job from KV
 */
export async function deleteJob(
  kv: KVNamespace,
  jobId: string
): Promise<void> {
  await kv.delete(`job:${jobId}`);
}

/**
 * List all jobs from KV
 * Returns jobs sorted by creation time (newest first)
 */
export async function listJobs(
  kv: KVNamespace,
  options?: { limit?: number; cursor?: string }
): Promise<{ jobs: ResourceJob[]; cursor?: string; hasMore: boolean }> {
  const limit = options?.limit || 100;
  const listResult = await kv.list({
    prefix: 'job:',
    limit,
    cursor: options?.cursor,
  });

  // Fetch all job values in parallel
  const jobs = await Promise.all(
    listResult.keys.map(async (key) => {
      const job = await kv.get<ResourceJob>(key.name, 'json');
      return job;
    })
  );

  // Filter out null values and sort by creation time (newest first)
  const validJobs = jobs
    .filter((job): job is ResourceJob => job !== null)
    .sort((a, b) => b.createdAt - a.createdAt);

  return {
    jobs: validJobs,
    cursor: !listResult.list_complete ? listResult.cursor : undefined,
    hasMore: !listResult.list_complete,
  };
}

/**
 * Cancel a job by marking it as failed
 * Note: This only marks the job as failed in KV. The queue consumer should check
 * job status before processing and skip if status is 'failed'.
 */
export async function cancelJob(
  kv: KVNamespace,
  jobId: string
): Promise<void> {
  const job = await getJob(kv, jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.status === 'completed') {
    throw new Error('Cannot cancel a completed job');
  }

  if (job.status === 'failed') {
    throw new Error('Job is already failed/cancelled');
  }

  await updateJob(kv, jobId, {
    status: 'failed',
    error: 'Cancelled by user',
    completedAt: Date.now(),
  });
}
