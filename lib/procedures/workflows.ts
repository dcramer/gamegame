/**
 * Workflows Procedures
 * oRPC procedures for workflow/job management
 */

import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { adminProcedure } from './base';
import { db } from '@/lib/db';
import { resources, games } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  listWorkflowRunsWithDetails,
  getWorkflowRun,
  cancelWorkflowRun,
} from '@/lib/services/workflows';
import { processResourceWorkflow } from '@/workflows/process-resource/index';

/**
 * List all workflow runs (jobs) with details
 */
export const list = adminProcedure
  .input(
    z.object({
      limit: z.number().optional().default(100),
    })
  )
  .handler(async ({ input }) => {
    // Query workflow runs with details
    const runs = await listWorkflowRunsWithDetails({
      limit: input.limit,
    });

    // Format the response
    const formattedJobs = runs.map((run) => ({
      runId: run.runId,
      type: run.workflowName,
      status: run.status,
      error: run.error || null,
      createdAt: run.createdAt.getTime(),
      completedAt: run.completedAt ? run.completedAt.getTime() : null,
      gameId: run.gameId,
      gameName: run.gameName,
      resourceId: run.resourceId,
      resourceName: run.resourceName,
    }));

    return { jobs: formattedJobs };
  });

/**
 * Cancel a workflow run
 */
export const cancel = adminProcedure
  .input(
    z.object({
      runId: z.string(),
    })
  )
  .handler(async ({ input }) => {
    // Get the workflow run
    const run = await getWorkflowRun(input.runId);

    if (!run) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Job not found',
      });
    }

    // Check if job can be cancelled
    if (run.status === 'completed') {
      throw new ORPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot cancel completed job',
      });
    }

    if (run.status === 'cancelled' || run.status === 'failed') {
      throw new ORPCError({
        code: 'BAD_REQUEST',
        message: 'Job is already cancelled or failed',
      });
    }

    // Cancel the workflow run
    await cancelWorkflowRun(input.runId);

    return {
      success: true,
      message: 'Job cancelled successfully',
    };
  });

/**
 * Retry a failed or cancelled workflow run
 */
export const retry = adminProcedure
  .input(
    z.object({
      runId: z.string(),
    })
  )
  .handler(async ({ input }) => {
    // Get the workflow run
    const run = await getWorkflowRun(input.runId);

    if (!run) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Job not found',
      });
    }

    // Only allow retrying failed or cancelled jobs
    if (run.status !== 'failed' && run.status !== 'cancelled') {
      throw new ORPCError({
        code: 'BAD_REQUEST',
        message: 'Only failed or cancelled jobs can be retried',
      });
    }

    // Extract original workflow input
    const originalInput = run.input[0] as any;
    if (!originalInput) {
      throw new ORPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid workflow data - no input found',
      });
    }

    // Create new run ID
    const newRunId = nanoid();

    // Trigger workflow asynchronously with original input but new runId
    const newWorkflowInput = {
      ...originalInput,
      runId: newRunId,
    };

    // Start workflow in background (don't await)
    processResourceWorkflow(newWorkflowInput).catch((error) => {
      console.error('[Retry Workflow] Error:', error);
    });

    return {
      success: true,
      runId: newRunId,
      message: 'Workflow retry initiated with original parameters',
    };
  });
