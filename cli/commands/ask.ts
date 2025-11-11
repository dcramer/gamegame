import { getGameByIdOrSlug } from '@/lib/cli/games';
import { error } from '../utils/output';

export async function askCommand() {
  const args = process.argv.slice(3);

  // Parse flags
  const showVerbose = args.includes('--verbose');

  // Remove all flags from args
  const filteredArgs = args.filter((arg) => !arg.startsWith('--'));

  const gameInput = filteredArgs[0];
  const prompt = filteredArgs.slice(1).join(' ');

  if (!gameInput || !prompt) {
    console.error('Usage: pnpm cli ask <game> <prompt> [options]');
    console.error('');
    console.error('<game> can be either a game ID or slug');
    console.error('');
    console.error('Options:');
    console.error(
      '  --verbose    Show detailed execution trace (events, timing, tool calls, performance metrics)'
    );
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli ask arcs "How do I setup the game?"');
    console.error('  pnpm cli ask arcs "How many players?"');
    console.error('  pnpm cli ask arcs "How many players?" --verbose');
    console.error('');
    process.exit(1);
  }

  try {
    // Verify game exists and get its name
    const game = await getGameByIdOrSlug(gameInput);
    if (!game) {
      error(`Game not found: ${gameInput}`);
      process.exit(1);
    }

    console.log(`Found game: ${game.name}`);
    console.log(`Prompt: ${prompt}`);
    console.log('---\n');

    // Make API call to chat endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/games/${gameInput}/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      error(`HTTP ${response.status}: ${errorText}`);
      process.exit(1);
    }

    // Stream the response
    if (!response.body) {
      error('No response body');
      process.exit(1);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const data = line.slice(6); // Remove 'data: ' prefix
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);

          // Handle different event types from Vercel AI SDK
          if (json.type === 'text-delta') {
            const chunk = json.textDelta ?? json.delta ?? '';
            if (chunk) {
              process.stdout.write(chunk);
              answer += chunk;
            }
          } else if (showVerbose && json.type === 'tool-input-available') {
            console.log(`\n[Tool] ${json.toolName}`);
            if (json.input) {
              console.log(`  Args: ${JSON.stringify(json.input)}`);
            }
          } else if (showVerbose && json.type === 'tool-output-available') {
            const outputPreview = typeof json.output === 'string'
              ? json.output
              : JSON.stringify(json.output);
            console.log(`  Result: ${outputPreview.slice(0, 100)}...`);
          } else if (showVerbose && json.type === 'finish') {
            const usage = json.usage ? JSON.stringify(json.usage) : 'n/a';
            console.log(`\n\n[Finish] Usage: ${usage}`);
          }
        } catch (parseError) {
          // Ignore parse errors for malformed chunks
          if (showVerbose) {
            console.error(`\n[Parse Error] ${parseError}`);
          }
        }
      }
    }

    console.log('\n');
    process.exit(0);
  } catch (err: any) {
    error(`Request failed: ${err.message}`);
    process.exit(1);
  }
}
