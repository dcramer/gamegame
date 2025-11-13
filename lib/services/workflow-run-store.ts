import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns, type WorkflowRunMetadata, type NewWorkflowRunRow } from '@/lib/db/schema/workflow-runs';

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface CreateWorkflowRunParams {
  runId: string;
  workflowName: string;
  status?: WorkflowRunStatus;
  metadata?: WorkflowRunMetadata;
  resourceId?: string | null;
  attachmentId?: string | null;
  gameId?: string | null;
  externalRunId?: string | null;
}

export async function createWorkflowRunRecord(params: CreateWorkflowRunParams) {
  const {
    runId,
    workflowName,
    status = 'pending',
    metadata = {},
    resourceId = null,
    attachmentId = null,
    gameId = null,
    externalRunId = null,
  } = params;

  const now = Date.now();

  await db
    .insert(workflowRuns)
    .values({
      id: runId,
      workflowName,
      status,
      metadata,
      resourceId: resourceId ?? null,
      attachmentId: attachmentId ?? null,
      gameId: gameId ?? null,
      externalRunId: externalRunId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workflowRuns.id,
      set: {
        workflowName,
        metadata,
        resourceId: resourceId ?? null,
        attachmentId: attachmentId ?? null,
        gameId: gameId ?? null,
        externalRunId: externalRunId ?? null,
        updatedAt: now,
      },
    });
}

interface UpdateWorkflowRunParams {
  metadata?: WorkflowRunMetadata;
  externalRunId?: string | null;
  completedAt?: number | null;
  label?: string;
}

export async function updateWorkflowRunRecord(
  runId: string | undefined,
  updates: UpdateWorkflowRunParams
) {
  if (!runId) return;

  const [existing] = await db
    .select({ metadata: workflowRuns.metadata, status: workflowRuns.status })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);

  if (!existing) {
    // Nothing to update
    return;
  }

  const mergedMetadata = {
    ...(existing.metadata ?? {}),
    ...(updates.metadata ?? {}),
  };

  if (updates.label) {
    mergedMetadata.label = updates.label;
  }

  const payload: Partial<NewWorkflowRunRow> = {
    status: existing.status ?? 'running',
    metadata: mergedMetadata,
    updatedAt: Date.now(),
  };

  if (Object.prototype.hasOwnProperty.call(updates, 'externalRunId')) {
    payload.externalRunId = updates.externalRunId ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'completedAt')) {
    payload.completedAt = updates.completedAt ?? null;
  }

  await db
    .update(workflowRuns)
    .set(payload)
    .where(eq(workflowRuns.id, runId));
}

export async function recordWorkflowStage(
  runId: string | undefined,
  stage: string,
  metadata?: WorkflowRunMetadata,
  label?: string
) {
  if (!runId) return;
  await updateWorkflowRunRecord(runId, {
    metadata: {
      stage,
      ...(metadata ?? {}),
    },
    label,
  });
}

export async function completeWorkflowRun(
  runId: string | undefined,
  metadata?: WorkflowRunMetadata
) {
  if (!runId) return;
  await updateWorkflowRunRecord(runId, {
    metadata,
    completedAt: Date.now(),
  });
}

export async function failWorkflowRun(
  runId: string | undefined,
  error: string,
  metadata?: WorkflowRunMetadata
) {
  if (!runId) return;
  await updateWorkflowRunRecord(runId, {
    metadata: {
      ...(metadata ?? {}),
      error,
    },
    completedAt: Date.now(),
  });
}

export async function deleteWorkflowRunRecord(runId: string | undefined) {
  if (!runId) return;
  await db.delete(workflowRuns).where(eq(workflowRuns.id, runId));
}
