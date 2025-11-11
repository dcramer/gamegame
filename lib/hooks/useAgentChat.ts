'use client';

import { useState, useCallback, useRef } from 'react';

export type ChatMessage =
  | {
      id: string;
      type: 'user';
      content: string;
      timestamp: number;
    }
  | {
      id: string;
      type: 'tool-call';
      name: string;
      args?: any;
      timestamp: number;
      status: 'running' | 'completed';
      durationMs?: number;
    }
  | {
      id: string;
      type: 'assistant';
      content: string;
      timestamp: number;
    };

type ToolCallMessage = Extract<ChatMessage, { type: 'tool-call' }>;

export interface ChatMetadata {
  performance?: any;
  model?: string;
  gameId?: string;
  timestamp?: number;
}

export type ChatStatus = 'idle' | 'loading' | 'streaming' | 'error';

export interface UseAgentChatOptions {
  api: string;
  onError?: (error: Error) => void;
}

export interface UseAgentChatReturn {
  messages: ChatMessage[];
  isThinking: boolean;
  metadata: ChatMetadata | null;
  status: ChatStatus;
  error: Error | null;
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
}

/**
 * Custom hook for handling chat with the OpenAI Agents SDK backend
 * Replaces @ai-sdk/react's useChat to work with our custom SSE format
 */
export function useAgentChat({ api, onError }: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [metadata, setMetadata] = useState<ChatMetadata | null>(null);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const assistantBufferRef = useRef('');

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setStatus('loading');
      setError(null);
      assistantBufferRef.current = '';

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const appendAssistantChunk = (chunk: string) => {
        if (!chunk) return;
        assistantBufferRef.current += chunk;
      };

      const flushAssistantBuffer = () => {
        const pending = assistantBufferRef.current;
        if (!pending) return;
        assistantBufferRef.current = '';
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            type: 'assistant',
            content: pending,
            timestamp: Date.now(),
          },
        ]);
      };

      try {

        const ensureToolCallMessage = (toolCallId: string, toolName: string) => {
          setMessages((prev) => {
            const exists = prev.some((msg) => msg.type === 'tool-call' && msg.id === toolCallId);
            if (exists) {
              return prev;
            }

            return [
              ...prev,
              {
                id: toolCallId,
                type: 'tool-call',
                name: toolName,
                timestamp: Date.now(),
                status: 'running' as const,
              },
            ];
          });
        };

        const updateToolCallMessage = (toolCallId: string, updates: Partial<ToolCallMessage>) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.type === 'tool-call' && msg.id === toolCallId) {
                return {
                  ...msg,
                  ...updates,
                };
              }
              return msg;
            })
          );
        };

        const completeToolCallMessage = (toolCallId: string) => {
          const completedAt = Date.now();
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.type === 'tool-call' && msg.id === toolCallId) {
                const durationMs = msg.durationMs ?? completedAt - msg.timestamp;
                return {
                  ...msg,
                  status: 'completed' as const,
                  durationMs,
                };
              }
              return msg;
            })
          );
        };

        // Build request body in the format expected by chat-handler
        const requestBody = {
          messages: [
            {
              role: 'user',
              content: text,
            },
          ],
        };

        const response = await fetch(api, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Request failed (${response.status}): ${errorText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        setStatus('streaming');

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamComplete = false;

        while (!streamComplete) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) {
              continue;
            }

            const data = line.slice(6); // Remove 'data: ' prefix

            if (data === '[DONE]') {
              // Stream complete - break out of both loops
              streamComplete = true;
              break;
            }

            try {
              const event = JSON.parse(data);

              switch (event.type) {
                case 'reasoning-start':
                  setIsThinking(true);
                  break;
                case 'reasoning-end':
                  setIsThinking(false);
                  break;
                case 'tool-input-start':
                  ensureToolCallMessage(event.toolCallId, event.toolName || 'tool');
                  setIsThinking(true);
                  break;
                case 'tool-input-available':
                  ensureToolCallMessage(event.toolCallId, event.toolName || 'tool');
                  if (event.input) {
                    updateToolCallMessage(event.toolCallId, { args: event.input });
                  }
                  break;
                case 'tool-output-available':
                case 'tool-output-error':
                  completeToolCallMessage(event.toolCallId);
                  setIsThinking(false);
                  break;
                case 'tool-call-start':
                  ensureToolCallMessage(event.toolCallId, event.toolName || 'tool');
                  setIsThinking(true);
                  break;
                case 'tool-call-end':
                  completeToolCallMessage(event.toolCallId);
                  setIsThinking(false);
                  break;
                case 'text-delta':
                  setIsThinking(false);
                  appendAssistantChunk(event.textDelta ?? event.delta ?? '');
                  break;
                case 'text-start':
                  setIsThinking(false);
                  break;
                case 'text-end':
                  flushAssistantBuffer();
                  break;
                case 'finish':
                  setIsThinking(false);
                  flushAssistantBuffer();
                  if (event.messageMetadata) {
                    setMetadata(event.messageMetadata);
                  }
                  break;
                case 'message-metadata':
                  if (event.messageMetadata) {
                    setMetadata(event.messageMetadata);
                  }
                  break;
                case 'error':
                  setIsThinking(false);
                  throw new Error(event.error || event.errorText || 'Unknown error occurred');
              }
            } catch (err) {
              // Skip invalid JSON lines, but rethrow actual errors from event handling
              if (err instanceof SyntaxError) {
                console.warn('Failed to parse SSE event:', line, err);
              } else {
                throw err;
              }
            }
          }
        }

        // Clear state for next turn
        setStatus('idle');
      } catch (err) {
        if (err instanceof Error) {
          // Ignore abort errors
          if (err.name === 'AbortError') {
            setStatus('idle');
            return;
          }

          setError(err);
          setStatus('error');
          onError?.(err);
        }
      } finally {
        // Ensure any buffered assistant output is committed
        flushAssistantBuffer();
        // Clean up: mark any still-running tool calls as completed
        // This prevents spinners from showing forever if stream ends unexpectedly
        setMessages((prev) =>
          prev.map((msg) =>
            msg.type === 'tool-call' && msg.status === 'running'
              ? { ...msg, status: 'completed' as const }
              : msg
          )
        );
        // Clear thinking state to prevent stuck indicator
        setIsThinking(false);
        abortControllerRef.current = null;
      }
    },
    [api, onError]
  );

  return {
    messages,
    isThinking,
    metadata,
    status,
    error,
    sendMessage,
    isLoading: status === 'loading' || status === 'streaming',
  };
}
