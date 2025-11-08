/**
 * Resource Reprocessing Service
 * Shared logic for reprocessing resources via workflow
 */

import { nanoid } from 'nanoid';
import { start } from 'workflow/api';
import { processResourceWorkflow } from '@/workflows/process-resource/index';
import { db } from '@/lib/db';
import { resources, games } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cancelWorkflowRun } from './workflows';

export interface ReprocessResourceInput {
  resourceId: string;
  fromStage?: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed';
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
      status: resources.status,
      currentRunId: resources.currentRunId,
    })
    .from(resources)
    .where(eq(resources.id, input.resourceId))
    .limit(1);

  if (!resource) {
    throw new Error('Resource not found');
  }

  // If resource is currently processing, cancel the existing workflow
  if (
    (resource.status === 'processing' || resource.status === 'queued') &&
    resource.currentRunId
  ) {
    try {
      await cancelWorkflowRun(resource.currentRunId);
      console.log(
        `[Reprocess Resource] Cancelled existing workflow run: ${resource.currentRunId}`
      );
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

  // Start workflow and wait for it to be registered
  const workflowInput = {
    runId,
    resourceId: resource.id,
    gameId: resource.gameId,
    gameName: game.name,
    name: resource.name,
    url: resource.url,
    fromStage: input.fromStage,
  };

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

  // Update resource status with the actual workflow run ID
  const startingStage = input.fromStage || 'ingest';
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
