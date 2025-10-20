#!/usr/bin/env tsx

/**
 * CLI tool for GameGame Workers
 * Usage: pnpm cli <command> [args]
 *
 * Commands:
 *   ask <gameId> <prompt>           - Ask a question about a game
 *   games                           - List all games with their IDs
 *   grant-admin <email> [--remote]  - Grant admin privileges to a user
 *   login-url <email>               - Generate a magic link login URL
 */

import { askCommand } from './cli/commands/ask';
import { gamesCommand } from './cli/commands/games';
import { grantAdminCommand } from './cli/commands/grant-admin';
import { loginUrlCommand } from './cli/commands/login-url';

const command = process.argv[2];

if (!command) {
  console.error('Usage: pnpm cli <command> [args]');
  console.error('\nCommands:');
  console.error('  ask <gameId> <prompt>           Ask a question about a game');
  console.error('  games                           List all games with their IDs');
  console.error('  grant-admin <email> [--remote]  Grant admin privileges to a user');
  console.error('  login-url <email>               Generate a magic link login URL');
  process.exit(1);
}

async function main() {
  switch (command) {
    case 'ask':
      await askCommand();
      break;
    case 'games':
      await gamesCommand();
      break;
    case 'grant-admin':
      await grantAdminCommand();
      break;
    case 'login-url':
      await loginUrlCommand();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('\nAvailable commands:');
      console.error('  ask <gameId> <prompt>           Ask a question about a game');
      console.error('  games                           List all games with their IDs');
      console.error('  grant-admin <email> [--remote]  Grant admin privileges to a user');
      console.error('  login-url <email>               Generate a magic link login URL');
      process.exit(1);
  }
}

main();
