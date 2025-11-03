#!/usr/bin/env tsx

/**
 * CLI tool for GameGame Workers
 * Usage: pnpm cli <resource> <action> [args]
 *
 * Resources:
 *   games      - Manage games
 *   resources  - Manage resources (rulebooks)
 *   users      - Manage users
 *   ask        - Ask questions about a game
 */

import { gamesCommand } from './cli/commands/games';
import { resourcesCommand } from './cli/commands/resources';
import { usersCommand } from './cli/commands/users';
import { askCommand } from './cli/commands/ask';

const resource = process.argv[2];
const action = process.argv[3];

if (!resource) {
  console.error('Usage: pnpm cli <resource> <action> [args]');
  console.error('\nResources:');
  console.error('  games list                              List all games');
  console.error('  games create <name> [options]           Create a new game');
  console.error('  resources create <game> <url> [options] Add a resource to a game');
  console.error('  users create <email> [options]          Create a user');
  console.error('  users grant-admin <email> [--remote]    Grant admin privileges');
  console.error('  users login-url <email>                 Generate magic link');
  console.error('  ask <game> <prompt>                     Ask a question about a game');
  process.exit(1);
}

async function main() {
  switch (resource) {
    case 'games':
      await gamesCommand(action);
      break;
    case 'resources':
      await resourcesCommand(action);
      break;
    case 'users':
      await usersCommand(action);
      break;
    case 'ask':
      // Backward compatibility: treat 'ask' as resource with action as game-slug
      await askCommand();
      break;
    default:
      console.error(`Unknown resource: ${resource}`);
      console.error('\nAvailable resources:');
      console.error('  games      - Manage games');
      console.error('  resources  - Manage resources (rulebooks)');
      console.error('  users      - Manage users');
      console.error('  ask        - Ask questions about a game');
      process.exit(1);
  }
}

main();
