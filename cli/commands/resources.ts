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

async function createAuthedClient() {
  const { createORPCClient } = await import('@orpc/client');
  const { RPCLink } = await import('@orpc/client/fetch');
  const { generateCliToken } = await import('../utils/auth');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const token = await generateCliToken();

  const link = new RPCLink({
    url: `${baseUrl}/api/rpc`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return {
    baseUrl,
    orpc: createORPCClient<CallableRouter>(link),
  };
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

    const { baseUrl, orpc } = await createAuthedClient();

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
  const gameIdArg = process.argv.find((arg) => arg.startsWith('--game='));
  const gameId = gameIdArg?.split('=')[1];

  try {
    const resourcesList = await getAllResources(gameId);

    if (resourcesList.length === 0) {
      info('No resources found to reprocess');
      process.exit(0);
    }

    console.log(`Found ${resourcesList.length} resources to reprocess`);
    console.log('');

    const { baseUrl, orpc } = await createAuthedClient();

    const results: Array<{ resourceId: string; runId?: string; status: string; error?: string }> = [];
    for (const resource of resourcesList) {
      try {
        const response = await orpc.resources.reprocess({ id: resource.id });
        console.log(`✓ ${resource.id}: Run ${response.runId} started`);
        results.push({ resourceId: resource.id, runId: response.runId, status: 'started' });
      } catch (err: any) {
        console.error(`✗ ${resource.id}: ${err.message}`);
        results.push({ resourceId: resource.id, status: 'failed', error: err.message });
      }
    }

    console.log('');
    console.log(
      `Reprocessing started for ${results.filter((r) => r.status === 'started').length}/${resourcesList.length} resources`
    );
    console.log('\nMonitor progress:');
    results
      .filter((r) => r.runId)
      .forEach((r) => {
        console.log(`  pnpm cli resources status ${r.runId}`);
      });
    console.log('\nAdmin UI:');
    console.log(`  ${baseUrl}/admin`);
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
