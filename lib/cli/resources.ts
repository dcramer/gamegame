/**
 * Shared resource utilities for CLI
 */

import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { resources } from '../db/schema/resources';
import { eq } from 'drizzle-orm';

export interface Job {
  id: string;
  status: string;
  progress: number;
  currentStep: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getJobStatus(jobId: string): Promise<Job | null> {
  const [job] = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      progress: jobs.progress,
      currentStep: jobs.currentStep,
      error: jobs.error,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  return job || null;
}

export async function getAllResources(gameId?: string) {
  if (gameId) {
    return await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        url: resources.url,
      })
      .from(resources)
      .where(eq(resources.gameId, gameId));
  }

  return await db
    .select({
      id: resources.id,
      gameId: resources.gameId,
      name: resources.name,
      url: resources.url,
    })
    .from(resources);
}
