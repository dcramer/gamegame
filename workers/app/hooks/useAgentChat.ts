import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  // For assistant messages: associated tool calls
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args?: any;
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

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
  toolCalls: ToolCall[];
  activeToolCalls: ToolCall[];
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
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
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
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setStatus('loading');
      setError(null);
      setToolCalls([]);
      setActiveToolCalls([]);

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
        let assistantText = '';
        const currentToolCalls = new Map<string, ToolCall>();
        // Track tool calls for this turn to attach to assistant message
        const currentTurnToolCalls: ToolCall[] = [];

        while (true) {
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
              // Stream complete
              break;
            }

            try {
              const event = JSON.parse(data);

              switch (event.type) {
                case 'tool-call-start':
                  {
                    const toolCall: ToolCall = {
                      id: event.toolCallId,
                      name: event.toolName,
                      args: event.args,
                      startTime: Date.now(),
                    };
                    currentToolCalls.set(event.toolCallId, toolCall);
                    setActiveToolCalls(Array.from(currentToolCalls.values()));
                  }
                  break;

                case 'tool-call-end':
                  {
                    const toolCall = currentToolCalls.get(event.toolCallId);
                    if (toolCall) {
                      toolCall.endTime = Date.now();
                      toolCall.durationMs = event.durationMs;
                      currentToolCalls.delete(event.toolCallId);
                      // Save to current turn for this assistant message
                      currentTurnToolCalls.push(toolCall);
                      setToolCalls((prev) => [...prev, toolCall]);
                      setActiveToolCalls(Array.from(currentToolCalls.values()));
                    }
                    // Clear thinking state when a tool completes
                    setIsThinking(false);
                  }
                  break;

                case 'thinking':
                  // Model is reasoning between tool calls
                  setIsThinking(true);
                  break;

                case 'text-delta':
                  if (event.textDelta) {
                    assistantText += event.textDelta;
                  }
                  break;

                case 'finish':
                  if (event.messageMetadata) {
                    setMetadata(event.messageMetadata);
                  }
                  break;

                case 'error':
                  throw new Error(event.error || 'Unknown error occurred');
              }
            } catch (err) {
              // Skip invalid JSON lines
              if (err instanceof Error && !err.message.startsWith('Request failed')) {
                console.warn('Failed to parse SSE event:', line, err);
              } else {
                throw err;
              }
            }
          }
        }

        // Add assistant message with the collected text
        if (assistantText) {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: assistantText,
            timestamp: Date.now(),
            // Attach tool calls from this turn
            toolCalls: currentTurnToolCalls.length > 0 ? currentTurnToolCalls : undefined,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }

        // Clear state for next turn
        setStatus('idle');
        setActiveToolCalls([]);
        setToolCalls([]);
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
        abortControllerRef.current = null;
      }
    },
    [api, onError]
  );

  return {
    messages,
    toolCalls,
    activeToolCalls,
    isThinking,
    metadata,
    status,
    error,
    sendMessage,
    isLoading: status === 'loading' || status === 'streaming',
  };
}
