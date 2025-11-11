import process from 'node:process';

type PostgresWorld = ReturnType<
  (typeof import('@workflow/world-postgres'))['createWorld']
>;

async function main() {
  // Always default to the Postgres world when this helper runs.
  process.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';

  const connectionString =
    process.env.WORKFLOW_POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('WORKFLOW_POSTGRES_URL (or DATABASE_URL) must be set to run the workflow worker.');
  }

  const { createWorld } = await import('@workflow/world-postgres');

  const world = createWorld({
    connectionString,
    jobPrefix: process.env.WORKFLOW_POSTGRES_JOB_PREFIX || 'gamegame',
    queueConcurrency: parseInt(
      process.env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY || '10',
      10
    ),
  });

  await world.start?.();
  console.log('[Workflows] Postgres workflow worker started.');

  setupShutdownHandlers(world);

  // Keep the process alive until it is explicitly terminated.
  await new Promise(() => {});
}

function setupShutdownHandlers(world: PostgresWorld) {
  const shutdown = async (signal?: string) => {
    console.log(`[Workflows] Shutting down workflow worker${signal ? ` (${signal})` : ''}...`);
    try {
      if ('stop' in world && typeof world.stop === 'function') {
        await world.stop();
      }
    } catch (error) {
      console.error('[Workflows] Failed to stop workflow worker cleanly:', error);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[Workflows] Failed to start Postgres workflow worker:', error);
  process.exit(1);
});
