import { getJobStatus, getAllResources } from '@/lib/cli/resources';
import type { CallableRouter } from '@/lib/procedures/router';
import { error, success, info } from '../utils/output';

async function resourceStatus() {
  const jobId = process.argv[4];

  if (!jobId) {
    console.error('Usage: pnpm cli resources status <job-id>');
    process.exit(1);
  }

  try {
    const job = await getJobStatus(jobId);

    if (!job) {
      error(`Job not found: ${jobId}`);
      process.exit(1);
    }

    console.log(`Job: ${job.id}`);
    console.log(`Status: ${job.status}`);
    if (job.error) {
      console.log(`Error: ${job.error}`);
    }
    if (job.metadata && typeof job.metadata === 'object') {
      const stage = (job.metadata as Record<string, unknown>).stage;
      const message = (job.metadata as Record<string, unknown>).message;
      if (stage) {
        console.log(`Stage: ${String(stage)}`);
      }
      if (message) {
        console.log(`Info: ${String(message)}`);
      }
    }
    console.log(`Created: ${job.createdAt.toISOString()}`);
    console.log(`Updated: ${job.updatedAt.toISOString()}`);
  } catch (err: any) {
    error(`Failed to fetch job status: ${err.message}`);
    process.exit(1);
  }
}

async function reprocessResource() {
  const resourceId = process.argv[4];
  const fromStageArg = process.argv.find((arg) => arg.startsWith('--from='));
  const fromStage = fromStageArg?.split('=')[1] as 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed' | undefined;

  if (!resourceId) {
    console.error('Usage: pnpm cli resources reprocess <resource-id> [--from=<stage>]');
    console.error('  Stages: ingest (default), vision, cleanup, metadata, embed');
    process.exit(1);
  }

  try {
    info(`Reprocessing resource ${resourceId}${fromStage ? ` from stage: ${fromStage}` : ''}...`);

    // Use oRPC client with JWT auth
    const { createORPCClient } = await import('@orpc/client');
    const { RPCLink } = await import('@orpc/client/fetch');
    const { generateCliToken } = await import('../utils/auth');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const token = await generateCliToken();

    // Create oRPC client with Bearer token auth
    const link = new RPCLink({
      url: `${baseUrl}/api/rpc`,
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const orpc = createORPCClient<CallableRouter>(link);

    const result = await orpc.resources.reprocess({
      id: resourceId,
      fromStage,
    });

    success(`Workflow started successfully!`);
    console.log(`Run ID: ${result.runId}`);
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);

    console.log(`\nMonitor progress:`);
    console.log(`  pnpm cli resources status ${result.runId}`);
    console.log(`  ${baseUrl}/admin/games/resources/${resourceId}`);
  } catch (err: any) {
    error(`Failed to reprocess resource: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

async function reprocessAll() {
  // Parse optional flags
  const gameIdArg = process.argv.find((arg) => arg.startsWith('--game='));
  const gameId = gameIdArg?.split('=')[1];

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // Get all resources
    const resourcesList = await getAllResources(gameId);

    if (resourcesList.length === 0) {
      info('No resources found to reprocess');
      process.exit(0);
    }

    console.log(`Found ${resourcesList.length} resources to reprocess`);
    console.log('');

    // Reprocess each resource
    const results = [];
    for (const resource of resourcesList) {
      try {
        const url = `${baseUrl}/api/workflows/process-resource`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resourceId: resource.id,
            gameId: resource.gameId,
            name: resource.name,
            url: resource.url,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✓ ${resource.id}: Job ${result.jobId} started`);
          results.push({ resourceId: resource.id, jobId: result.jobId, status: 'started' });
        } else {
          const errorText = await response.text();
          console.error(`✗ ${resource.id}: Failed - ${errorText}`);
          results.push({ resourceId: resource.id, status: 'failed', error: errorText });
        }
      } catch (err: any) {
        console.error(`✗ ${resource.id}: ${err.message}`);
        results.push({ resourceId: resource.id, status: 'error', error: err.message });
      }
    }

    console.log('');
    console.log(
      `Reprocessing started for ${results.filter((r) => r.status === 'started').length}/${resourcesList.length} resources`
    );
    console.log('\nMonitor progress:');
    results
      .filter((r) => r.jobId)
      .forEach((r) => {
        console.log(`  pnpm cli resources status ${r.jobId}`);
      });
  } catch (err: any) {
    error(`Failed to reprocess resources: ${err.message}`);
    process.exit(1);
  }
}

export async function resourcesCommand(action?: string) {
  if (!action) {
    console.error('Usage: pnpm cli resources <action> [args]');
    console.error('\nAvailable actions:');
    console.error('  status <job-id>               Check processing status');
    console.error('  reprocess <resource-id>       Reprocess a single resource');
    console.error('  reprocess-all [--game=<id>]   Reprocess all resources');
    process.exit(1);
  }

  switch (action) {
    case 'status':
      await resourceStatus();
      break;
    case 'reprocess':
      await reprocessResource();
      break;
    case 'reprocess-all':
      await reprocessAll();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      console.error('\nAvailable actions:');
      console.error('  status <job-id>               Check processing status');
      console.error('  reprocess <resource-id>       Reprocess a single resource');
      console.error('  reprocess-all [--game=<id>]   Reprocess all resources');
      process.exit(1);
  }
}
