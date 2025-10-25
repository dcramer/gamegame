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
