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

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Build request body in the format expected by chat-handler
        const requestBody = {
          messages: [
            {
              role: 'user',
              parts: [{ type: 'text', text }],
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
                case 'tool-call-start':
                  {
                    // Append tool-call message in 'running' state
                    const toolCallMessage: ChatMessage = {
                      id: event.toolCallId,
                      type: 'tool-call',
                      name: event.toolName,
                      args: event.args,
                      timestamp: Date.now(),
                      status: 'running',
                    };
                    setMessages((prev) => [...prev, toolCallMessage]);
                  }
                  break;

                case 'tool-call-end':
                  {
                    // Update existing tool-call message to 'completed' with duration
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.type === 'tool-call' && msg.id === event.toolCallId
                          ? { ...msg, status: 'completed' as const, durationMs: event.durationMs }
                          : msg
                      )
                    );
                    // Clear thinking state when a tool completes
                    setIsThinking(false);
                  }
                  break;

                case 'thinking':
                  // Model is reasoning between tool calls
                  setIsThinking(true);
                  break;

                case 'text-delta':
                  // Agent is generating response, not thinking anymore
                  setIsThinking(false);
                  if (event.textDelta) {
                    // Append to or create assistant message
                    setMessages((prev) => {
                      const lastMsg = prev[prev.length - 1];
                      if (lastMsg?.type === 'assistant') {
                        // Append to existing assistant message
                        return [
                          ...prev.slice(0, -1),
                          {
                            ...lastMsg,
                            content: lastMsg.content + event.textDelta,
                          },
                        ];
                      }
                      // Create new assistant message
                      return [
                        ...prev,
                        {
                          id: `assistant-${Date.now()}`,
                          type: 'assistant',
                          content: event.textDelta,
                          timestamp: Date.now(),
                        },
                      ];
                    });
                  }
                  break;

                case 'finish':
                  // Agent is done - clear thinking state
                  setIsThinking(false);
                  if (event.messageMetadata) {
                    setMetadata(event.messageMetadata);
                  }
                  break;

                case 'error':
                  // Clear thinking on error
                  setIsThinking(false);
                  throw new Error(event.error || 'Unknown error occurred');
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
