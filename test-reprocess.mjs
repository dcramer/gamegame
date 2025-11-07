#!/usr/bin/env node
import { start } from 'workflow/api';
import { processResourceWorkflow } from './workflows/process-resource/index.ts';
import { nanoid } from 'nanoid';
import { db } from './lib/db/index.ts';
import { resources } from './lib/db/schema/resources.ts';
import { games } from './lib/db/schema/games.ts';
import { eq } from 'drizzle-orm';

const resourceId = 'aXw-9SlP5-a57HVuvKv1R';

// Get resource details
const [resource] = await db
  .select({
    id: resources.id,
    gameId: resources.gameId,
    name: resources.name,
    url: resources.url,
  })
  .from(resources)
  .where(eq(resources.id, resourceId))
  .limit(1);

if (!resource) {
  console.error('Resource not found');
  process.exit(1);
}

// Get game details
const [game] = await db
  .select({ name: games.name })
  .from(games)
  .where(eq(games.id, resource.gameId))
  .limit(1);

if (!game) {
  console.error('Game not found');
  process.exit(1);
}

// Create new run ID
const runId = nanoid();

console.log('Starting workflow...');
console.log('Resource:', resource.name);
console.log('Game:', game.name);
console.log('Run ID:', runId);

// Update resource status
await db
  .update(resources)
  .set({
    status: 'processing',
    processingStage: 'ingest',
    currentRunId: runId,
    updatedAt: Date.now(),
  })
  .where(eq(resources.id, resourceId));

// Trigger workflow
const workflowInput = {
  runId,
  resourceId: resource.id,
  gameId: resource.gameId,
  gameName: game.name,
  name: resource.name,
  url: resource.url,
};

try {
  await start(processResourceWorkflow, [workflowInput]);
  console.log('Workflow started successfully!');
} catch (error) {
  console.error('Failed to start workflow:', error);
  process.exit(1);
}
