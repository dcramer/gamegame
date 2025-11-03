/**
 * SSE (Server-Sent Events) streaming utilities for CLI
 * Provides async iterators for consuming SSE streams
 */

export interface SSEEvent {
  type: string;
  data: any;
}

/**
 * Parse an SSE event line
 * Format: "data: {...json...}\n\n"
 */
function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const data = line.slice(6); // Remove 'data: ' prefix

  if (data === '[DONE]') {
    return { type: 'done', data: '[DONE]' };
  }

  try {
    const parsed = JSON.parse(data);
    return { type: parsed.type || 'unknown', data: parsed };
  } catch (err) {
    // Invalid JSON - skip this line
    return null;
  }
}

/**
 * Stream SSE events from a fetch Response
 * Yields parsed events as they arrive
 */
export async function* streamSSE(response: Response): AsyncIterableIterator<SSEEvent> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') {
          continue; // Skip empty lines
        }

        const event = parseSSELine(line);
        if (event) {
          yield event;

          if (event.type === 'done') {
            return; // Stream complete
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const event = parseSSELine(buffer);
      if (event) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Collect text deltas from an SSE stream
 * Returns the complete text once streaming finishes
 */
export async function collectTextFromSSE(
  stream: AsyncIterableIterator<SSEEvent>,
  onEvent?: (event: SSEEvent) => void
): Promise<{ text: string; metadata: any }> {
  let text = '';
  let metadata: any = null;

  for await (const event of stream) {
    // Call optional event handler
    if (onEvent) {
      onEvent(event);
    }

    // Collect text deltas
    if (event.type === 'text-delta' && event.data.textDelta) {
      text += event.data.textDelta;
    }

    // Collect metadata
    if (event.type === 'finish' && event.data.messageMetadata) {
      metadata = event.data.messageMetadata;
    }

    // Also check for legacy message-metadata events
    if (event.type === 'message-metadata' && event.data.messageMetadata) {
      metadata = event.data.messageMetadata;
    }
  }

  return { text, metadata };
}
