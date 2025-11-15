'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { ChatMessage, ChatMessageMetadata } from './useAgentChat';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseMessageMetadata = (metadata: unknown): ChatMessageMetadata | undefined => {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const record = metadata as Record<string, unknown>;
  const responseTimeMs = isFiniteNumber(record.responseTimeMs) ? record.responseTimeMs : undefined;
  const completedAt = typeof record.completedAt === 'string' ? record.completedAt : undefined;

  let tokens: ChatMessageMetadata['tokens'];
  const rawTokens = record.tokens;
  if (rawTokens && typeof rawTokens === 'object') {
    const tokenRecord = rawTokens as Record<string, unknown>;
    const inputTokens = isFiniteNumber(tokenRecord.inputTokens)
      ? tokenRecord.inputTokens
      : tokenRecord.inputTokens === null
      ? null
      : undefined;
    const outputTokens = isFiniteNumber(tokenRecord.outputTokens)
      ? tokenRecord.outputTokens
      : tokenRecord.outputTokens === null
      ? null
      : undefined;
    const totalTokens = isFiniteNumber(tokenRecord.totalTokens)
      ? tokenRecord.totalTokens
      : tokenRecord.totalTokens === null
      ? null
      : undefined;

    if (
      inputTokens !== undefined ||
      outputTokens !== undefined ||
      totalTokens !== undefined
    ) {
      tokens = { inputTokens, outputTokens, totalTokens };
    }
  }

  if (
    responseTimeMs === undefined &&
    !tokens &&
    completedAt === undefined
  ) {
    return undefined;
  }

  return {
    responseTimeMs,
    completedAt,
    tokens: tokens ?? null,
  };
};

export interface UseGameChatOptions {
  api: string;
  onError?: (error: Error) => void;
}

export interface UseGameChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Adapter that wraps AI SDK's useChat to work with our custom message format.
 * This allows us to use upstream AI SDK while maintaining our existing UI components.
 */
export function useGameChat({ api, onError }: UseGameChatOptions): UseGameChatReturn {
  console.log('[useGameChat] Configured API endpoint:', api);

  const {
    messages: aiMessages,
    sendMessage: aiSendMessage,
    stop,
    status,
    error,
  } = useChat({
    transport: new DefaultChatTransport({
      api,
    }),
    onError: (err) => {
      console.error('[useGameChat] Error:', err);
      onError?.(err);
    },
  });

  // Convert AI SDK messages to our custom format
  const messages: ChatMessage[] = aiMessages.flatMap((m) => {
    if (m.role === 'user') {
      // Extract text from user message parts
      const textPart = m.parts.find((p) => p.type === 'text');
      return [
        {
          id: m.id,
          type: 'user' as const,
          content: textPart?.text || '',
          timestamp: Date.now(),
        },
      ];
    }

    if (m.role === 'assistant') {
      const result: ChatMessage[] = [];
      const metadata = parseMessageMetadata(m.metadata);

      // Extract tool calls as separate messages
      m.parts.forEach((part) => {
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const toolPart = part as typeof part & {
            toolCallId?: string;
            input?: unknown;
            state?: string;
          };

          if (!toolPart.toolCallId) {
            return;
          }

          // Parse tool name from type (e.g., 'tool-search_resources' -> 'search_resources')
          const toolName = toolPart.type.replace('tool-', '');
          const partState = toolPart.state;

          result.push({
            id: toolPart.toolCallId,
            type: 'tool-call' as const,
            name: toolName,
            args: toolPart.input,
            status: partState === 'output-available' || partState === 'output-error'
              ? 'completed'
              : 'running',
            timestamp: Date.now(),
            durationMs: undefined,
          });
        }
      });

      // Extract assistant text content (our structured JSON response)
      const textPart = m.parts.find((p) => p.type === 'text');
      if (textPart?.text) {
        result.push({
          id: m.id,
          type: 'assistant' as const,
          content: textPart.text,
          timestamp: Date.now(),
          metadata,
        });
      }

      return result;
    }

    // Ignore system messages
    return [];
  });

  // Wrap AI SDK sendMessage to match our async signature
  const sendMessage = async (text: string) => {
    aiSendMessage({ text });
  };

  return {
    messages,
    sendMessage,
    stop,
    isLoading: status === 'submitted' || status === 'streaming',
    error: error ?? null,
  };
}
