import { listGamesForCLI, createGameForCLI } from '@/lib/cli/games';
import { formatTable, success, error } from '../utils/output';

async function listGames() {
  try {
    const games = await listGamesForCLI();

    if (games.length === 0) {
      console.log('No games found.');
      return;
    }

    console.log(`Found ${games.length} game${games.length === 1 ? '' : 's'}:\n`);

    formatTable(games, [
      { key: 'id', label: 'ID', width: 22 },
      { key: 'name', label: 'Name', width: 30 },
      { key: 'resourceCount', label: 'Resources', width: 10 },
    ]);

    console.log('');
  } catch (err: any) {
    error(`Failed to fetch games: ${err.message}`);
    process.exit(1);
  }
}

async function createGame() {
  const name = process.argv[4];

  if (!name) {
    console.error('Usage: pnpm cli games create <name> [--bgg-url=<url>]');
    process.exit(1);
  }

  // Parse optional flags
  const bggUrl = process.argv.find((arg) => arg.startsWith('--bgg-url='))?.split('=')[1];

  console.log(`\n🎮 Creating game...`);

  try {
    const game = await createGameForCLI({ name, bggUrl });

    success(`Game created: ${game.name}`);
    console.log(`  ID: ${game.id}`);
    if (game.bggUrl) {
      console.log(`  BGG URL: ${game.bggUrl}`);
    }
    console.log('');
  } catch (err: any) {
    error(`Failed to create game: ${err.message}`);
    process.exit(1);
  }
}

export async function gamesCommand(action?: string) {
  if (!action || action === 'list') {
    await listGames();
    return;
  }

  switch (action) {
    case 'create':
      await createGame();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      console.error('\nAvailable actions:');
      console.error('  list             List all games');
      console.error('  create <name>    Create a new game');
      process.exit(1);
  }
}
