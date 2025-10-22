import type { Env, QueueMessage, ProcessingTaskType } from '@/types';
import type { MessageBatch, ExportedHandler } from '@cloudflare/workers-types';
import { updateJob } from '../lib/jobs/status';
import { handleProcessingTask } from '../lib/processing/pdf-processor';
import { getDb, resources } from '../lib/db';
import { eq } from 'drizzle-orm';

const queueLog = (event: string, data: Record<string, unknown>) => {
  console.log(JSON.stringify({ module: 'resource-queue', event, ...data }));
};

/**
 * Queue consumer worker for PDF processing
 * Handles messages from RESOURCE_QUEUE
 */
const STAGE_START_STATUS: Record<ProcessingTaskType, { step: string; progress: number }> = {
  INGEST: { step: 'Starting PDF ingestion', progress: 5 },
  VISION: { step: 'Running vision analysis', progress: 30 },
  CLEANUP: { step: 'Cleaning markdown', progress: 50 },
  EMBED: { step: 'Embedding content', progress: 70 },
  FINALIZE: { step: 'Finalizing resource', progress: 90 },
};

const handler: ExportedHandler<Env> = {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const rawTask = message.body as Partial<QueueMessage> & {
        jobId: string;
        resourceId: string;
        gameId: string;
        name: string;
      };
      const task: QueueMessage = {
        type: rawTask.type ?? 'INGEST',
        jobId: rawTask.jobId,
        resourceId: rawTask.resourceId,
        gameId: rawTask.gameId,
        name: rawTask.name,
        url: rawTask.url,
        gameName: rawTask.gameName,
        sourceKey: rawTask.sourceKey,
      };
      queueLog('task_start', {
        type: task.type,
        resourceId: task.resourceId,
        jobId: task.jobId,
      });

      try {
        const startUpdate = STAGE_START_STATUS[task.type];
        if (startUpdate) {
          await updateJob(env.JOB_STATUS_KV, task.jobId, {
            status: 'processing',
            currentStep: startUpdate.step,
            progress: startUpdate.progress,
          });
        }

        const nextTask = await handleProcessingTask(task, env);

        if (Array.isArray(nextTask)) {
          for (const child of nextTask) {
            await env.RESOURCE_QUEUE.send(child);
          }
        } else if (nextTask) {
          await env.RESOURCE_QUEUE.send(nextTask);
        } else if (task.type === 'FINALIZE') {
          queueLog('resource_complete', {
            resourceId: task.resourceId,
            jobId: task.jobId,
          });
        }

        message.ack();
      } catch (error) {
        const cause = (error as any)?.cause;
        const causeMessage = cause
          ? cause.message ?? (typeof cause === 'object' ? JSON.stringify(cause) : String(cause))
          : undefined;
        const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        const logMessage = causeMessage ? `${errorMessage} | Cause: ${causeMessage}` : errorMessage;
        queueLog('task_error', {
          type: task.type,
          resourceId: task.resourceId,
          jobId: task.jobId,
          error: logMessage,
          stack: error instanceof Error ? error.stack : undefined,
          causeStack: cause instanceof Error ? cause.stack : undefined,
        });

        await updateJob(env.JOB_STATUS_KV, task.jobId, {
          status: 'failed',
          currentStep: `Processing failed: ${errorMessage}`,
          error: causeMessage ? `${errorMessage} | ${causeMessage}` : errorMessage || 'Unknown processing error',
        });

        const db = getDb(env.DB);
        await db
          .update(resources)
          .set({
            status: 'failed',
            processingStage: 'failed',
            updatedAt: new Date(),
          })
          .where(eq(resources.id, task.resourceId));

        message.retry();
      }
    }
  },
};

export default handler;
