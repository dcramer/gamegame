/**
 * Shared resource utilities for CLI
 */

import { db } from '../db';
import { resources } from '../db/schema/resources';
import { eq, or } from 'drizzle-orm';
import { getWorkflowRun } from '../services/workflows';
import { workflowRuns } from '../db/schema/workflow-runs';

export interface Job {
  id: string;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown> | null;
}

export async function getJobStatus(jobId: string): Promise<Job | null> {
  try {
    const run = await getWorkflowRun(jobId);

    if (!run) {
      return null;
    }

    const [localRun] = await db
      .select({ metadata: workflowRuns.metadata })
      .from(workflowRuns)
      .where(
        or(
          eq(workflowRuns.id, jobId),
          eq(workflowRuns.externalRunId, jobId)
        )
      )
      .limit(1);

    return {
      id: run.runId,
      status: run.status,
      error: run.error || null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      metadata: localRun?.metadata ?? null,
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
