import { getApiUrl } from '../utils';

export async function askCommand() {
  const args = process.argv.slice(3);
  const gameId = args[0];
  const prompt = args.slice(1).join(' ');

  if (!gameId || !prompt) {
    console.error('Usage: pnpm cli ask <gameId> <prompt>');
    console.error('Example: pnpm cli ask 0nglgzyy60ax3fpfu4oz3 "How do I setup the game?"');
    process.exit(1);
  }

  const url = `${getApiUrl(false)}/api/games/${gameId}/chat`;

  console.log(`Game ID: ${gameId}`);
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
      console.error(`Error ${response.status}:`, error);
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

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      console.error('No response body');
      process.exit(1);
    }

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (SSE format)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(line.slice(6)); // Remove "data: " prefix

          if (data.type === 'text-delta') {
            // Text content being streamed
            process.stdout.write(data.delta);
          } else if (data.type === 'tool-input-start') {
            // Tool call starting
            console.log(`\n\n[Tool: ${data.toolName}]`);
          } else if (data.type === 'finish-step') {
            // Step finished
            console.log();
          }
        } catch {
          // Ignore parse errors for non-JSON lines
        }
      }
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Request failed:', error);
    process.exit(1);
  }
}
