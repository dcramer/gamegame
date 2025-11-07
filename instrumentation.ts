import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // Initialize Vercel Workflow workers for Postgres backend
    // Only run in Node.js runtime (not Edge)
    if (process.env.WORKFLOW_TARGET_WORLD === '@workflow/world-postgres') {
      console.log('[Workflows] Starting workflow workers...');
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
      console.log('[Workflows] Workflow workers started!');
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
