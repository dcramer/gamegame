import type { Env, QueueMessage, ProcessingTaskType } from '@/types';
import type { MessageBatch, ExportedHandler } from '@cloudflare/workers-types';
import { updateJob, getJob } from '../lib/jobs/status';
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
  VISION: { step: 'Running vision analysis', progress: 25 },
  CLEANUP: { step: 'Cleaning markdown', progress: 40 },
  METADATA: { step: 'Generating metadata', progress: 55 },
  EMBED: { step: 'Embedding content', progress: 75 },
  FINALIZE: { step: 'Finalizing resource', progress: 95 },
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
        // Check if job has been cancelled before processing
        const currentJob = await getJob(env.JOB_STATUS_KV, task.jobId);
        if (!currentJob) {
          queueLog('job_not_found', {
            type: task.type,
            resourceId: task.resourceId,
            jobId: task.jobId,
          });
          message.ack();
          continue;
        }

        if (currentJob.status === 'failed') {
          queueLog('job_cancelled', {
            type: task.type,
            resourceId: task.resourceId,
            jobId: task.jobId,
            error: currentJob.error,
          });
          message.ack();
          continue;
        }

        const startUpdate = STAGE_START_STATUS[task.type];
        if (startUpdate) {
          await updateJob(env.JOB_STATUS_KV, task.jobId, {
            status: 'processing',
            currentStep: startUpdate.step,
            progress: startUpdate.progress,
          });
        }

        const nextTask = await handleProcessingTask(task, env);

        // Enqueue next task(s) before ACK to ensure pipeline continues
        // If queue send fails, we retry the current message
        try {
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
        } catch (queueError) {
          // Queue send failed - log and retry without marking resource as failed
          // The current task will be retried, and since handleProcessingTask is idempotent,
          // it will return the same nextTask
          queueLog('queue_send_failed', {
            type: task.type,
            resourceId: task.resourceId,
            jobId: task.jobId,
            error: queueError instanceof Error ? queueError.message : String(queueError),
          });
          message.retry();
          continue; // Skip to next message in batch
        }

        // Only ACK after successful queue send
        message.ack();
      } catch (error) {
        // Build comprehensive error context for debugging
        const errorObj = error as any;
        const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Capture error cause chain (can be nested multiple levels deep)
        const causes: Array<{ message: string; stack?: string }> = [];
        let currentCause = errorObj?.cause;
        while (currentCause && causes.length < 5) { // Limit to 5 levels to prevent infinite loops
          if (currentCause instanceof Error) {
            causes.push({
              message: `${currentCause.name}: ${currentCause.message}`,
              stack: currentCause.stack,
            });
            currentCause = (currentCause as any).cause;
          } else if (typeof currentCause === 'object') {
            causes.push({
              message: JSON.stringify(currentCause),
            });
            currentCause = currentCause.cause;
          } else {
            causes.push({
              message: String(currentCause),
            });
            break;
          }
        }

        const fullErrorMessage = causes.length > 0
          ? `${errorMessage} | Caused by: ${causes.map(c => c.message).join(' → ')}`
          : errorMessage;

        queueLog('task_error', {
          type: task.type,
          resourceId: task.resourceId,
          jobId: task.jobId,
          error: errorMessage,
          fullError: fullErrorMessage,
          stack: errorStack,
          causes: causes.length > 0 ? causes : undefined,
        });

        // Store full error context in job status for admin visibility
        const errorContext = {
          message: errorMessage,
          stack: errorStack ? errorStack.split('\n').slice(0, 10).join('\n') : undefined, // First 10 lines of stack
          causes: causes.map(c => ({
            message: c.message,
            stack: c.stack ? c.stack.split('\n').slice(0, 5).join('\n') : undefined, // First 5 lines per cause
          })),
        };

        await updateJob(env.JOB_STATUS_KV, task.jobId, {
          status: 'failed',
          currentStep: `${task.type} stage failed: ${errorMessage}`,
          error: JSON.stringify(errorContext),
        });

        const db = getDb(env.DB);
        await db
          .update(resources)
          .set({
            status: 'failed',
            processingStage: 'failed',
            processingMetadata: null, // Clear stale metadata
            currentJobId: null, // Clear job reference
            updatedAt: new Date(),
          })
          .where(eq(resources.id, task.resourceId));

        message.retry();
      }
    }
  },
};

export default handler;
