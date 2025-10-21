import type { Env, QueueMessage } from '@/types';
import type { MessageBatch, ExportedHandler } from '@cloudflare/workers-types';
import { updateJob } from '../lib/jobs/status';
import { processResourcePDF } from '../lib/processing/pdf-processor';

/**
 * Queue consumer worker for PDF processing
 * Handles messages from RESOURCE_QUEUE
 */
const handler: ExportedHandler<Env> = {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { jobId, resourceId, gameId, name, url, gameName, sourceKey } = message.body as QueueMessage;

      console.log(`[Queue] Processing resource: ${resourceId} (job: ${jobId}) url=${url} sourceKey=${sourceKey ?? 'none'}`);

      try {
        // Update job status to processing
        await updateJob(env.JOB_STATUS_KV, jobId, {
          status: 'processing',
          currentStep: 'Starting PDF processing',
          progress: 5,
        });

        // Process the PDF
        await processResourcePDF({
          resourceId,
          gameId,
          name,
          url,
          env,
          gameName, // Pass game name for vision analysis context
          sourceKey,
          onProgress: async (step: string, progress: number) => {
            await updateJob(env.JOB_STATUS_KV, jobId, {
              currentStep: step,
              progress,
            });
          },
        });

        // Mark job as complete
        await updateJob(env.JOB_STATUS_KV, jobId, {
          status: 'completed',
          progress: 100,
          currentStep: 'Processing complete',
          completedAt: Date.now(),
        });

        // Acknowledge message
        message.ack();

        console.log(`[Queue] Successfully processed resource: ${resourceId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error(
          `[Queue] Error processing resource ${resourceId}: ${errorMessage}`,
          error instanceof Error ? error.stack : error
        );

        // Update job status to failed
        await updateJob(env.JOB_STATUS_KV, jobId, {
          status: 'failed',
          currentStep: `Processing failed: ${errorMessage}`,
          error: errorMessage || 'Unknown processing error',
        });

        // Retry the message (up to max_retries in wrangler.toml)
        message.retry();
      }
    }
  },
};

export default handler;
