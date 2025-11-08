import { createWorld } from '@workflow/core/runtime';
import type { World, WorkflowRun as CoreWorkflowRun } from '@workflow/world';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema/games';
import { resources } from '@/lib/db/schema/resources';
import { eq, inArray } from 'drizzle-orm';

/**
 * Workflow run status types from Vercel Workflows
 */
export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

/**
 * Workflow run data from Vercel Workflows storage
 */
export interface WorkflowRun {
  runId: string;
  deploymentId: string;
  status: WorkflowRunStatus;
  workflowName: string;
  executionContext?: Record<string, any>;
  input: any[];
  output?: any;
  error?: string;
  errorCode?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extended workflow run with game and resource details
 */
export interface WorkflowRunWithDetails extends WorkflowRun {
  gameName?: string;
  resourceName?: string;
  resourceId?: string;
  gameId?: string;
  inputArgs?: any; // Can be array or object
}

/**
 * List all workflow runs with optional filtering
 */
export async function listWorkflowRuns(params?: {
  workflowName?: string;
  status?: WorkflowRunStatus;
  limit?: number;
  cursor?: string;
}): Promise<{ runs: WorkflowRun[]; nextCursor?: string }> {
  const world = createWorld();

  const result = await world.runs.list({
    workflowName: params?.workflowName,
    status: params?.status,
    pagination: params?.limit || params?.cursor
      ? {
          limit: params.limit,
          cursor: params.cursor,
        }
      : undefined,
  });

  return {
    runs: result.data,
    nextCursor: result.cursor,
  };
}

/**
 * Get a specific workflow run by ID
 */
export async function getWorkflowRun(runId: string): Promise<WorkflowRun> {
  const world = createWorld();
  return await world.runs.get(runId);
}

/**
 * Cancel a workflow run
 */
export async function cancelWorkflowRun(runId: string): Promise<WorkflowRun> {
  const world = createWorld();
  return await world.runs.cancel(runId);
}

/**
 * Extract resourceId and gameId from workflow run input
 * Works generically for any workflow that includes these fields
 */
function extractIds(run: WorkflowRun): { resourceId?: string; gameId?: string } {
  // Workflow input is an array of arguments
  const input = run.input[0] as any;
  if (!input || typeof input !== 'object') return {};

  // Extract fields if they exist (works for any workflow type)
  return {
    resourceId: input.resourceId,
    gameId: input.gameId,
  };
}

/**
 * List workflow runs with game and resource names joined
 */
export async function listWorkflowRunsWithDetails(params?: {
  workflowName?: string;
  status?: WorkflowRunStatus;
  limit?: number;
}): Promise<WorkflowRunWithDetails[]> {
  const { runs } = await listWorkflowRuns(params);

  // Extract all unique resource and game IDs
  const resourceIds = new Set<string>();
  const gameIds = new Set<string>();

  runs.forEach(run => {
    const { resourceId, gameId } = extractIds(run);
    if (resourceId) resourceIds.add(resourceId);
    if (gameId) gameIds.add(gameId);
  });

  // Fetch all resources and games in parallel
  const [resourcesData, gamesData] = await Promise.all([
    resourceIds.size > 0
      ? db.select().from(resources).where(
          inArray(resources.id, Array.from(resourceIds))
        )
      : Promise.resolve([]),
    gameIds.size > 0
      ? db.select().from(games).where(
          inArray(games.id, Array.from(gameIds))
        )
      : Promise.resolve([]),
  ]);

  // Create lookup maps
  const resourcesMap = new Map(resourcesData.map(r => [r.id, r]));
  const gamesMap = new Map(gamesData.map(g => [g.id, g]));

  // Join the data
  return runs.map(run => {
    const { resourceId, gameId } = extractIds(run);

    // Debug: log the raw input
    console.log('[Workflow Input Debug]', {
      workflowName: run.workflowName,
      inputArray: run.input,
      inputLength: run.input?.length,
      firstArg: run.input?.[0],
      firstArgType: typeof run.input?.[0],
    });

    // Workflows always take a single argument: run.input[0]
    // Pass just the first argument to the frontend
    const inputArgs = run.input?.[0];

    return {
      ...run,
      resourceId,
      gameId,
      resourceName: resourceId ? resourcesMap.get(resourceId)?.name : undefined,
      gameName: gameId ? gamesMap.get(gameId)?.name : undefined,
      inputArgs,
    };
  });
}

/**
 * Get workflow run with game and resource details
 */
export async function getWorkflowRunWithDetails(
  runId: string
): Promise<WorkflowRunWithDetails> {
  const run = await getWorkflowRun(runId);
  const { resourceId, gameId } = extractIds(run);

  // Fetch resource and game if IDs are present
  const [resource, game] = await Promise.all([
    resourceId ? db.select().from(resources).where(eq(resources.id, resourceId)).limit(1) : Promise.resolve([]),
    gameId ? db.select().from(games).where(eq(games.id, gameId)).limit(1) : Promise.resolve([]),
  ]);

  return {
    ...run,
    resourceId,
    gameId,
    resourceName: resource[0]?.name,
    gameName: game[0]?.name,
  };
}
