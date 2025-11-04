import { getApiUrl } from '../utils';

async function createResource() {
  const gameSlugOrId = process.argv[4];
  const pdfUrl = process.argv[5];

  if (!gameSlugOrId || !pdfUrl) {
    console.error('Usage: pnpm cli resources create <game-slug-or-id> <pdf-url> [--name=<name>]');
    process.exit(1);
  }

  // Parse optional flags
  const name = process.argv.find(arg => arg.startsWith('--name='))?.split('=')[1];

  const url = `${getApiUrl(false)}/api/resources/upload`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameSlugOrId,
        url: pdfUrl,
        name,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error ${response.status}:`, error);
      process.exit(1);
    }

    const result = await response.json();

    console.log(`✓ Resource upload started`);
    console.log(`  Job ID: ${result.jobId}`);
    console.log(`  Resource ID: ${result.resourceId}`);
    console.log(`  Game: ${result.gameId}`);
    console.log('\nProcessing in background...');
    console.log(`Monitor status: pnpm cli resources status ${result.jobId}`);
  } catch (error) {
    console.error('Failed to create resource:', error);
    process.exit(1);
  }
}

async function resourceStatus() {
  const jobId = process.argv[4];

  if (!jobId) {
    console.error('Usage: pnpm cli resources status <job-id>');
    process.exit(1);
  }

  const url = `${getApiUrl(false)}/api/resources/jobs/${jobId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error ${response.status}:`, error);
      process.exit(1);
    }

    const job = await response.json();

    console.log(`Job: ${job.jobId}`);
    console.log(`Status: ${job.status}`);
    console.log(`Progress: ${job.progress}%`);
    if (job.currentStep) {
      console.log(`Step: ${job.currentStep}`);
    }
    if (job.error) {
      console.log(`Error: ${job.error}`);
    }
  } catch (error) {
    console.error('Failed to fetch job status:', error);
    process.exit(1);
  }
}

async function reprocessResource() {
  const resourceId = process.argv[4];

  if (!resourceId) {
    console.error('Usage: pnpm cli resources reprocess <resource-id> [--from=<stage>]');
    console.error('\nStages:');
    console.error('  ingest (default)  Full reprocess from PDF extraction');
    console.error('  vision            Re-run vision analysis and subsequent stages');
    console.error('  cleanup           Re-run markdown cleanup and subsequent stages');
    console.error('  metadata          Re-run metadata generation and subsequent stages');
    console.error('  embed             Re-run chunking and embedding only');
    process.exit(1);
  }

  // Parse optional --from flag
  const fromArg = process.argv.find(arg => arg.startsWith('--from='));
  const from = fromArg?.split('=')[1] || 'embed'; // Default to embed for new enrichment

  const baseUrl = getApiUrl(false);
  const url = `${baseUrl}/api/resources/${resourceId}/reprocess?from=${from}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error ${response.status}:`, error);
      process.exit(1);
    }

    const result = await response.json();

    console.log(`✓ Resource reprocessing started`);
    console.log(`  Job ID: ${result.jobId}`);
    console.log(`  Resource ID: ${resourceId}`);
    console.log(`  Stage: ${from}`);
    console.log('\nProcessing in background...');
    console.log(`Monitor status: pnpm cli resources status ${result.jobId}`);
  } catch (error) {
    console.error('Failed to reprocess resource:', error);
    process.exit(1);
  }
}

async function reprocessAll() {
  // Parse optional flags
  const gameSlugArg = process.argv.find(arg => arg.startsWith('--game='));
  const gameSlug = gameSlugArg?.split('=')[1];

  const fromArg = process.argv.find(arg => arg.startsWith('--from='));
  const from = fromArg?.split('=')[1] || 'embed';

  const baseUrl = getApiUrl(false);

  try {
    // First, get all resources
    let resourcesUrl = `${baseUrl}/api/games`;
    if (gameSlug) {
      resourcesUrl += `/${gameSlug}/resources`;
    }

    // Fetch games/resources
    const gamesResponse = await fetch(resourcesUrl);
    if (!gamesResponse.ok) {
      const error = await gamesResponse.text();
      console.error(`Error fetching resources: ${gamesResponse.status}`, error);
      process.exit(1);
    }

    const data = await gamesResponse.json();

    // Extract resource IDs
    let resourceIds: string[] = [];
    if (gameSlug) {
      // Response is array of resources
      resourceIds = data.map((r: any) => r.id);
    } else {
      // Response is array of games, each with resources
      resourceIds = data.flatMap((game: any) =>
        (game.resources || []).map((r: any) => r.id)
      );
    }

    if (resourceIds.length === 0) {
      console.log('No resources found to reprocess');
      process.exit(0);
    }

    console.log(`Found ${resourceIds.length} resources to reprocess from stage: ${from}`);
    console.log('');

    // Reprocess each resource
    const results = [];
    for (const resourceId of resourceIds) {
      try {
        const url = `${baseUrl}/api/resources/${resourceId}/reprocess?from=${from}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✓ ${resourceId}: Job ${result.jobId} started`);
          results.push({ resourceId, jobId: result.jobId, status: 'started' });
        } else {
          const error = await response.text();
          console.error(`✗ ${resourceId}: Failed - ${error}`);
          results.push({ resourceId, status: 'failed', error });
        }
      } catch (error) {
        console.error(`✗ ${resourceId}: ${error}`);
        results.push({ resourceId, status: 'error', error });
      }
    }

    console.log('');
    console.log(`Reprocessing started for ${results.filter(r => r.status === 'started').length}/${resourceIds.length} resources`);
    console.log('\nMonitor progress:');
    results.filter(r => r.jobId).forEach(r => {
      console.log(`  pnpm cli resources status ${r.jobId}`);
    });
  } catch (error) {
    console.error('Failed to reprocess resources:', error);
    process.exit(1);
  }
}

export async function resourcesCommand(action?: string) {
  if (!action) {
    console.error('Usage: pnpm cli resources <action> [args]');
    console.error('\nAvailable actions:');
    console.error('  create <game> <url>           Add a resource to a game');
    console.error('  status <job-id>               Check processing status');
    console.error('  reprocess <resource-id>       Reprocess a single resource');
    console.error('  reprocess-all [--game=<slug>] Reprocess all resources');
    process.exit(1);
  }

  switch (action) {
    case 'create':
      await createResource();
      break;
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
      console.error('  create <game> <url>           Add a resource to a game');
      console.error('  status <job-id>               Check processing status');
      console.error('  reprocess <resource-id>       Reprocess a single resource');
      console.error('  reprocess-all [--game=<slug>] Reprocess all resources');
      process.exit(1);
  }
}
