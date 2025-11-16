/**
 * Resource Reprocessing Service
 * Shared logic for reprocessing resources via workflow
 */

import { nanoid } from 'nanoid';
import { start } from 'workflow/api';
import { processResourceWorkflow } from '@/workflows/process-resource';
import { db } from '@/lib/db';
import { resources, games, workflowRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cancelWorkflowRun } from './workflows';
import type { ReprocessStage } from '@/lib/reprocess/stages';
import {
  createWorkflowRunRecord,
  updateWorkflowRunRecord,
} from '@/lib/services/workflow-run-store';

export interface ReprocessResourceInput {
  resourceId: string;
  fromStage?: ReprocessStage;
  onlyStage?: boolean;
}

export interface ReprocessResourceResult {
  id: string;
  status: 'processing';
  runId: string;
  message: string;
}

/**
 * Reprocess a resource from a specific stage
 * This function is used by both the oRPC procedure and CLI
 */
export async function reprocessResource(
  input: ReprocessResourceInput
): Promise<ReprocessResourceResult> {
  // Get resource details
  const [resource] = await db
    .select({
      id: resources.id,
      gameId: resources.gameId,
      name: resources.name,
      url: resources.url,
      currentRunId: resources.currentRunId,
    })
    .from(resources)
    .where(eq(resources.id, input.resourceId))
    .limit(1);

  if (!resource) {
    throw new Error('Resource not found');
  }

  // If there's a workflow already associated, cancel it before starting a new one
  if (resource.currentRunId) {
    try {
      await cancelWorkflowRun(resource.currentRunId);
      console.log(
        `[Reprocess Resource] Cancelled existing workflow run: ${resource.currentRunId}`
      );

      // Mark the cancelled workflow as cancelled in our database
      // This will cause the UI to stop polling it
      // Try to find the local run ID for this external run ID
      const [existingRun] = await db
        .select({ id: workflowRuns.id, metadata: workflowRuns.metadata })
        .from(workflowRuns)
        .where(eq(workflowRuns.externalRunId, resource.currentRunId))
        .limit(1);

      if (existingRun) {
        await db
          .update(workflowRuns)
          .set({
            status: 'cancelled',
            completedAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {
              ...(existingRun.metadata ?? {}),
              status: 'Cancelled for reprocess',
            },
          })
          .where(eq(workflowRuns.id, existingRun.id));
      }
    } catch (cancelError) {
      console.error(
        '[Reprocess Resource] Failed to cancel existing workflow:',
        cancelError
      );
      // Continue anyway - the new workflow will update the status
    }
  }

  // Get game details
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .where(eq(games.id, resource.gameId))
    .limit(1);

  if (!game) {
    throw new Error('Game not found');
  }

  // Create new run ID for workflow
  const runId = nanoid();

  // Determine starting stage
  const startingStage: ReprocessStage = input.fromStage || 'ingest';

  // Start workflow and wait for it to be registered
  const workflowInput = {
    runId,
    resourceId: resource.id,
    gameId: resource.gameId,
    gameName: game.name,
    name: resource.name,
    url: resource.url,
    fromStage: input.fromStage,
    onlyStage: Boolean(input.onlyStage),
  };

  await createWorkflowRunRecord({
    runId,
    workflowName: 'process-resource',
    status: 'pending',
    resourceId: resource.id,
    gameId: resource.gameId,
    metadata: {
      jobName: `Processing ${resource.name}`,
      resourceName: resource.name,
      stage: startingStage,
      status: 'Starting workflow...',
      progress: 0,
      onlyStage: Boolean(input.onlyStage),
      fromStage: startingStage,
    },
  });

  let workflowRun;
  try {
    workflowRun = await start(processResourceWorkflow, [workflowInput]);
  } catch (error) {
    console.error('[Reprocess Resource] Workflow start error:', error);
    // Mark resource as failed
    await db
      .update(resources)
      .set({
        status: 'failed',
        processingStage: 'failed',
        processingMetadata: null,
        currentRunId: null,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));
    throw error;
  }

  // Extract runId from the Run object returned by start()
  const actualRunId = workflowRun.runId;

  await updateWorkflowRunRecord(runId, {
    externalRunId: actualRunId,
  });

  // Update resource status with the actual workflow run ID
  await db
    .update(resources)
    .set({
      status: 'processing',
      processingStage: startingStage,
      currentRunId: actualRunId,
      updatedAt: Date.now(),
    })
    .where(eq(resources.id, input.resourceId));

  return {
    id: resource.id,
    status: 'processing' as const,
    runId: actualRunId,
    message: resource.currentRunId
      ? 'Cancelled existing job and queued resource for reprocessing'
      : 'Resource queued for reprocessing',
  };
}
