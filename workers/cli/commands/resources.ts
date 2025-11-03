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

export async function resourcesCommand(action?: string) {
  if (!action) {
    console.error('Usage: pnpm cli resources <action> [args]');
    console.error('\nAvailable actions:');
    console.error('  create <game> <url>  Add a resource to a game');
    console.error('  status <job-id>      Check processing status');
    process.exit(1);
  }

  switch (action) {
    case 'create':
      await createResource();
      break;
    case 'status':
      await resourceStatus();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      console.error('\nAvailable actions:');
      console.error('  create <game> <url>  Add a resource to a game');
      console.error('  status <job-id>      Check processing status');
      process.exit(1);
  }
}
