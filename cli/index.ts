#!/usr/bin/env tsx

/**
 * CLI tool for GameGame Next.js
 * Usage: pnpm cli <resource> <action> [args]
 *
 * Resources:
 *   games      - Manage games
 *   resources  - Manage resources (rulebooks)
 *   users      - Manage users
 *   ask        - Ask questions about a game
 */

// Load environment variables from .env.local BEFORE any other imports
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first (highest priority), then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// Parse arguments before dynamic imports
const resource = process.argv[2];
const action = process.argv[3];

if (!resource) {
  console.error('Usage: pnpm cli <resource> <action> [args]');
  console.error('\nResources:');
  console.error('  games list                              List all games');
  console.error('  games create <name> [options]           Create a new game');
  console.error('  resources status <job-id>               Check processing status');
  console.error('  resources reprocess <resource-id>       Reprocess a single resource');
  console.error('  resources reprocess-all [--game=<slug>] Reprocess all resources');
  console.error('  users create <email> [options]          Create a user');
  console.error('  users grant-admin <email>               Grant admin privileges');
  console.error('  users login-url <email>                 Generate magic link');
  console.error('  ask <game> <prompt>                     Ask a question about a game');
  process.exit(1);
}

async function main() {
  // Use dynamic imports to ensure dotenv runs before database connection
  switch (resource) {
    case 'games': {
      const { gamesCommand } = await import('./commands/games');
      await gamesCommand(action);
      break;
    }
    case 'resources': {
      const { resourcesCommand } = await import('./commands/resources');
      await resourcesCommand(action);
      break;
    }
    case 'users': {
      const { usersCommand } = await import('./commands/users');
      await usersCommand(action);
      break;
    }
    case 'ask': {
      // Backward compatibility: treat 'ask' as resource with action as game-slug
      const { askCommand } = await import('./commands/ask');
      await askCommand();
      break;
    }
    default:
      console.error(`Unknown resource: ${resource}`);
      console.error('\nAvailable resources:');
      console.error('  games      - Manage games');
      console.error('  resources  - Manage resources (rulebooks)');
      console.error('  users      - Manage users');
      console.error('  ask        - Ask questions about a game');
      process.exit(1);
  }

  // Exit after successful command execution
  // This ensures the process doesn't hang due to open database connections
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
