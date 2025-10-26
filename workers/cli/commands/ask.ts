import { getApiUrl, getLocalD1 } from '../utils';
import { getDb, games } from '../../src/lib/db';
import { eq } from 'drizzle-orm';

export async function askCommand() {
  const args = process.argv.slice(3);
  const gameInput = args[0];
  const prompt = args.slice(1).join(' ');

  if (!gameInput || !prompt) {
    console.error('Usage: pnpm cli ask <game> <prompt>');
    console.error('');
    console.error('<game> can be either a game ID or slug');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli ask arcs "How do I setup the game?"');
    console.error('  pnpm cli ask 0nglgzyy60ax3fpfu4oz3 "How many players?"');
    process.exit(1);
  }

  // Determine if input is a slug (contains hyphens or lowercase letters) or an ID
  let gameId = gameInput;

  // If it looks like a slug (contains hyphens), look up the ID
  if (gameInput.includes('-') || /^[a-z]/.test(gameInput)) {
    const d1 = await getLocalD1();
    const db = getDb(d1);

    const [game] = await db
      .select({ id: games.id, name: games.name })
      .from(games)
      .where(eq(games.slug, gameInput))
      .limit(1);

    if (!game) {
      console.error(`Game not found with slug: ${gameInput}`);
      console.error('Run "pnpm cli games" to see available games');
      process.exit(1);
    }

    gameId = game.id;
    console.log(`Found game: ${game.name} (${gameId})`);
  }

  const url = `${getApiUrl(false)}/api/games/${gameId}/chat`;

  console.log(`Prompt: ${prompt}`);
  console.log('---\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            parts: [
              {
                type: 'text',
                text: prompt,
              },
            ],
            id: `msg-${Date.now()}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`\nError ${response.status}:`, error);
      process.exit(1);
    }

    // Log rate limit headers
    const rateLimit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (rateLimit) {
      console.log(
        `[Rate Limit: ${remaining}/${rateLimit}, resets at ${new Date(parseInt(reset!) * 1000).toLocaleTimeString()}]\n`
      );
    }

    // Get response text
    const fullResponse = await response.text();
    console.log('');

    // Parse and display structured output
    try {
      const structuredOutput = JSON.parse(fullResponse);

      // Display answer
      console.log(structuredOutput.answer);
      console.log('');

      // Display confidence if low or medium
      if (structuredOutput.confidence && structuredOutput.confidence !== 'high') {
        console.log(`⚠️  Confidence: ${structuredOutput.confidence}`);
        console.log('');
      }

      // Display ambiguities
      if (structuredOutput.ambiguities && structuredOutput.ambiguities.length > 0) {
        console.log('⚠️  Ambiguities:');
        structuredOutput.ambiguities.forEach((amb: string) => {
          console.log(`  - ${amb}`);
        });
        console.log('');
      }

      // Display citations
      if (structuredOutput.citations && structuredOutput.citations.length > 0) {
        console.log('Sources:');
        structuredOutput.citations.forEach((citation: any) => {
          const pageInfo = citation.pageNumber
            ? ` (page ${citation.pageNumber})`
            : citation.pageRange
              ? ` (pages ${citation.pageRange[0]}-${citation.pageRange[1]})`
              : '';
          const section = citation.section ? ` - ${citation.section}` : '';
          console.log(`  • ${citation.resourceName}${pageInfo}${section}`);

          if (citation.quote) {
            console.log(`    "${citation.quote}"`);
          }
        });
        console.log('');
      }

      // Display follow-ups
      if (structuredOutput.followUps && structuredOutput.followUps.length > 0) {
        console.log('Follow-up questions:');
        structuredOutput.followUps.forEach((followUp: any) => {
          // Handle both simple strings and structured objects
          const question = typeof followUp === 'string' ? followUp : followUp.question;
          const category = typeof followUp === 'object' && followUp.category ? `[${followUp.category}]` : '';
          console.log(`  ${category}${category ? ' ' : ''}${question}`);
        });
        console.log('');
      }
    } catch (error) {
      console.error('⚠️  Failed to parse response as JSON');
      console.error(fullResponse || '(empty response)');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Request failed:', error);
    process.exit(1);
  }
}
