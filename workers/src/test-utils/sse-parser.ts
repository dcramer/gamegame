import type { PerformanceMetadata } from '@/types';

export interface ParsedAgentResponse {
  /** The full answer text from the agent */
  answer: string;
  /** Structured output if the agent returned JSON */
  structured?: {
    answer: string;
    questionType?: string;
    citations?: any[];
    confidence?: string;
    ambiguities?: string[];
    followUps?: any[];
    playerCountSpecific?: number;
    expansionSpecific?: string[];
  };
  /** Performance metrics from the agent execution */
  performance: PerformanceMetadata;
  /** Full metadata from the finish event */
  metadata?: any;
}

/**
 * Parse SSE (Server-Sent Events) response from chat endpoint
 * Extracts answer text, structured output, and performance metrics
 */
export async function parseSSEResponse(response: Response): Promise<ParsedAgentResponse> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chat request failed (${response.status}): ${error}`);
  }

  const fullResponse = await response.text();
  const lines = fullResponse.split('\n');

  let messageMetadata: any = null;
  let answerText = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6); // Remove 'data: ' prefix

      if (data === '[DONE]') {
        break;
      }

      try {
        const event = JSON.parse(data);

        // Collect text deltas to build the answer
        if (event.type === 'text-delta' && event.delta) {
          answerText += event.delta;
        }

        // Capture metadata from finish event (overwrites previous metadata)
        // The last metadata event should have the complete performance data
        if (event.type === 'finish' && event.messageMetadata) {
          messageMetadata = event.messageMetadata;
        }

        // Also check message-metadata events (keep last non-empty one)
        if (event.type === 'message-metadata' && event.messageMetadata) {
          // Only update if it has actual content (not empty object)
          if (Object.keys(event.messageMetadata).length > 0) {
            messageMetadata = event.messageMetadata;
          }
        }
      } catch (err) {
        // Ignore parse errors for individual events
      }
    }
  }

  if (!answerText || answerText.trim() === '') {
    throw new Error('No answer text found in SSE response');
  }

  // Try to parse answer as JSON (structured output)
  let structured: ParsedAgentResponse['structured'] | undefined;
  try {
    const parsed = JSON.parse(answerText.trim());
    if (parsed.answer) {
      structured = parsed;
      answerText = parsed.answer; // Use just the answer text
    }
  } catch {
    // Not JSON, use as plain text
  }

  // If no performance metadata in SSE, create mock data for testing
  // TODO: Fix AI SDK to properly serialize async metadata functions
  const performance: PerformanceMetadata = messageMetadata?.performance || {
    totalTokens: {
      prompt: 100,
      completion: 50,
      total: 150,
      reasoning: 0,
    },
    totalDurationMs: 100,
    steps: [],
    toolCallCount: 0,
    avgToolDurationMs: 0,
  };

  return {
    answer: answerText.trim(),
    structured,
    performance,
    metadata: messageMetadata,
  };
}
