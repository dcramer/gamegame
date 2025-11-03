import { execSync } from 'child_process';

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

async function listGames() {
  const isRemote = process.argv.includes('--remote');
  const locationFlag = isRemote ? '--remote' : '--local';

  try {
    const cmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT g.id, g.name, g.year, g.slug, g.bgg_url, COUNT(DISTINCT r.id) as resource_count FROM games g LEFT JOIN resources r ON g.id = r.game_id GROUP BY g.id ORDER BY g.name;"`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    // Parse wrangler JSON output (extract JSON from output)
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse wrangler output');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const games = parsed[0]?.results || [];

    if (games.length === 0) {
      console.log('No games found.');
      return;
    }

    console.log(`Found ${games.length} game${games.length === 1 ? '' : 's'}:\n`);

    // Find max lengths for alignment
    const maxNameLength = Math.max(...games.map((g: any) => g.name.length));
    const maxSlugLength = Math.max(...games.map((g: any) => (g.slug || '').length));

    for (const game of games) {
      const slug = (game.slug || '').padEnd(maxSlugLength);
      const resourceText = game.resource_count > 0 ? `(${game.resource_count} resource${game.resource_count === 1 ? '' : 's'})` : '';

      console.log(`  ${slug}  ${game.name.padEnd(maxNameLength)}  ${resourceText}`);
    }

    console.log('');
  } catch (error: any) {
    console.error('Failed to fetch games:', error.message);
    process.exit(1);
  }
}

async function createGame() {
  const { nanoid } = await import('nanoid');
  const name = process.argv[4];

  if (!name) {
    console.error('Usage: pnpm cli games create <name> [--bgg-url=<url>] [--remote]');
    process.exit(1);
  }

  // Parse optional flags
  const bggUrl = process.argv.find(arg => arg.startsWith('--bgg-url='))?.split('=')[1];
  const isRemote = process.argv.includes('--remote');
  const locationFlag = isRemote ? '--remote' : '--local';
  const location = isRemote ? 'production' : 'local';

  console.log(`\n🎮 Creating game in ${location} database...`);

  const gameId = nanoid();
  const escapedName = escapeSql(name);
  const escapedBggUrl = bggUrl ? `'${escapeSql(bggUrl)}'` : 'NULL';
  const now = Math.floor(Date.now() / 1000);

  // Generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  try {
    // Check if slug already exists
    const checkCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT id, name FROM games WHERE slug = '${slug}';"`;
    const checkResult = execSync(checkCmd, { encoding: 'utf-8', stdio: 'pipe' });
    const checkJsonMatch = checkResult.match(/\[[\s\S]*\]/);
    if (!checkJsonMatch) {
      throw new Error('Could not parse wrangler output');
    }
    const checkParsed = JSON.parse(checkJsonMatch[0]);

    if (checkParsed[0]?.results?.length > 0) {
      console.error(`\n❌ Game with slug "${slug}" already exists: ${checkParsed[0].results[0].name}`);
      process.exit(1);
    }

    // Insert game
    const insertCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "INSERT INTO games (id, name, slug, bgg_url, created_at, updated_at) VALUES ('${gameId}', '${escapedName}', '${slug}', ${escapedBggUrl}, ${now}, ${now});"`;
    execSync(insertCmd, { encoding: 'utf-8', stdio: 'pipe' });

    // Verify
    const verifyCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT id, name, slug, bgg_url FROM games WHERE id = '${gameId}';"`;
    const verifyResult = execSync(verifyCmd, { encoding: 'utf-8', stdio: 'pipe' });
    const verifyJsonMatch = verifyResult.match(/\[[\s\S]*\]/);
    if (!verifyJsonMatch) {
      throw new Error('Could not parse wrangler output');
    }
    const verifyParsed = JSON.parse(verifyJsonMatch[0]);
    const game = verifyParsed[0]?.results?.[0];

    if (!game) {
      console.error('\n❌ Game was created but verification failed');
      process.exit(1);
    }

    console.log(`\n✅ Game created: ${game.name}`);
    console.log(`  ID: ${game.id}`);
    console.log(`  Slug: ${game.slug}`);
    if (game.bgg_url) {
      console.log(`  BGG URL: ${game.bgg_url}`);
    }
    console.log('');
  } catch (error: any) {
    console.error('\n❌ Failed to create game:', error.message);
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
