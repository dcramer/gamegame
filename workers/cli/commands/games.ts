import { getApiUrl } from '../utils';

export async function gamesCommand() {
  const url = `${getApiUrl(false)}/api/games`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error ${response.status}:`, error);
      process.exit(1);
    }

    const games = await response.json();

    if (games.length === 0) {
      console.log('No games found.');
      process.exit(0);
    }

    console.log(`Found ${games.length} game${games.length === 1 ? '' : 's'}:\n`);

    // Find max lengths for alignment
    const maxNameLength = Math.max(...games.map((g: any) => g.name.length));
    const maxSlugLength = Math.max(...games.map((g: any) => (g.slug || '').length));

    for (const game of games) {
      const slug = (game.slug || '').padEnd(maxSlugLength);
      const resourceText = game.resourceCount > 0 ? `(${game.resourceCount} resource${game.resourceCount === 1 ? '' : 's'})` : '';

      console.log(`  ${slug}  ${game.name.padEnd(maxNameLength)}  ${resourceText}`);
    }

    console.log('');
  } catch (error) {
    console.error('Failed to fetch games:', error);
    process.exit(1);
  }
}
