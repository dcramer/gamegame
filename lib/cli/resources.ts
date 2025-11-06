/**
 * Shared resource utilities for CLI
 */

import { db } from '../db';
import { resources } from '../db/schema/resources';
import { eq } from 'drizzle-orm';
import { getWorkflowRun } from '../services/workflows';

export interface Job {
  id: string;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getJobStatus(jobId: string): Promise<Job | null> {
  try {
    const run = await getWorkflowRun(jobId);

    if (!run) {
      return null;
    }

    return {
      id: run.runId,
      status: run.status,
      error: run.error || null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  } catch (error) {
    console.error('Failed to get job status:', error);
    return null;
  }
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
