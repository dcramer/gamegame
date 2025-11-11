import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // Inline workflow workers are disabled by default. Use scripts/workflows/start-postgres-worker.ts
    // (e.g. via `pnpm dev:workflows`) to run the worker in a dedicated process.
    const inlineWorkerEnabled = process.env.WORKFLOW_INLINE_WORKER === 'true';

    if (
      inlineWorkerEnabled &&
      process.env.WORKFLOW_TARGET_WORLD === '@workflow/world-postgres'
    ) {
      console.log('[Workflows] Starting inline workflow worker...');
      const { createWorld } = await import('@workflow/world-postgres');

      const world = createWorld({
        connectionString: process.env.WORKFLOW_POSTGRES_URL!,
        jobPrefix: process.env.WORKFLOW_POSTGRES_JOB_PREFIX || 'gamegame',
        queueConcurrency: parseInt(
          process.env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY || '10',
          10
        ),
      });

      await world.start?.();
      console.log('[Workflows] Inline workflow worker started.');
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
