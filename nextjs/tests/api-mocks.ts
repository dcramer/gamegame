/**
 * Mock utilities for EXTERNAL API calls only
 *
 * Philosophy: Only mock network boundaries (OpenAI, Mistral, BGG, Resend)
 * All internal modules (DB, Vectorize, R2) use real implementations
 */

import { vi } from 'vitest';

/**
 * Create a mock fetch function for intercepting external API calls
 * Can be configured to route to real APIs for integration testing
 */
export function createMockFetch(options: { useRealAPIs?: boolean } = {}) {
  const mockFetch = vi.fn();

  if (options.useRealAPIs) {
    // Pass through to real fetch
    mockFetch.mockImplementation((...args) => (globalThis.fetch as any)(...args));
  }

  global.fetch = mockFetch as any;
  return mockFetch;
}

/**
 * OpenAI API Response Builders
 */
export const openAI = {
  /**
   * Mock a successful chat completion response
   */
  chatCompletion(content: string | object) {
    const stringContent = typeof content === 'string' ? content : JSON.stringify(content);

    const responseData = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-5-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: stringContent,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    };

    return {
      ok: true,
      status: 200,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData),
    };
  },

  /**
   * Mock embeddings response
   */
  embeddings(texts: string[], dimensions: number = 1536) {
    const responseData = {
      object: 'list',
      data: texts.map((text, index) => ({
        object: 'embedding',
        index,
        embedding: Array(dimensions).fill(0).map(() => Math.random()),
      })),
      model: 'text-embedding-3-small',
      usage: {
        prompt_tokens: texts.join(' ').length / 4,
        total_tokens: texts.join(' ').length / 4,
      },
    };

    return {
      ok: true,
      status: 200,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData),
    };
  },

  /**
   * Mock streaming Responses API response (for GPT-5/Responses API)
   * Returns a ReadableStream that emits Server-Sent Events in Responses API format
   */
  streamingResponse(content: string) {
    const encoder = new TextEncoder();
    const itemId = 'item_test_123';
    const responseId = 'resp_test_456';

    const stream = new ReadableStream({
      start(controller) {
        // response.created event
        const createdEvent = {
          type: 'response.created',
          response: {
            id: responseId,
            object: 'realtime.response',
            status: 'in_progress',
            output: [],
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(createdEvent)}\n\n`));

        // response.output_item.added event
        const itemAddedEvent = {
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            id: itemId,
            object: 'realtime.item',
            type: 'message',
            role: 'assistant',
            content: [],
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(itemAddedEvent)}\n\n`));

        // Stream content in chunks
        const chunkSize = 50;
        for (let i = 0; i < content.length; i += chunkSize) {
          const chunk = content.substring(i, i + chunkSize);
          const deltaEvent = {
            type: 'response.output_text.delta',
            item_id: itemId,
            output_index: 0,
            delta: chunk,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));
        }

        // response.output_item.done event
        const itemDoneEvent = {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            id: itemId,
            object: 'realtime.item',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(itemDoneEvent)}\n\n`));

        // response.completed event
        const completedEvent = {
          type: 'response.completed',
          response: {
            id: responseId,
            object: 'realtime.response',
            status: 'completed',
            output: [
              {
                id: itemId,
                object: 'realtime.item',
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: content,
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              total_tokens: 150,
            },
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completedEvent)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      }),
      body: stream,
    };
  },

  /**
   * Mock streaming chat completion response (for AI SDK)
   * Returns a ReadableStream that emits Server-Sent Events
   */
  streamingChatCompletion(chunks: Array<{ content?: string; toolCalls?: any[] }>) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // First chunk with role
        const roleChunk = {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-5-mini',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(roleChunk)}\n\n`));

        // Content and tool call chunks
        chunks.forEach((chunk) => {
          if (chunk.content) {
            const contentChunk = {
              id: 'chatcmpl-test',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: 'gpt-5-mini',
              choices: [
                {
                  index: 0,
                  delta: { content: chunk.content },
                  finish_reason: null,
                },
              ],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));
          }

          if (chunk.toolCalls) {
            chunk.toolCalls.forEach((toolCall, idx) => {
              const toolChunk = {
                id: 'chatcmpl-test',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: 'gpt-5-mini',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          id: toolCall.id || `call_${idx}`,
                          type: 'function',
                          function: {
                            name: toolCall.name,
                            arguments: JSON.stringify(toolCall.arguments),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`));
            });
          }
        });

        // Final chunk with finish reason
        const finishChunk = {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-5-mini',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      }),
      body: stream,
    };
  },

  /**
   * Mock error response
   */
  error(status: number, message: string) {
    return {
      ok: false,
      status,
      statusText: message,
      text: async () => JSON.stringify({ error: { message } }),
      json: async () => ({ error: { message } }),
    };
  },
};

/**
 * Mistral API Response Builders
 */
export const mistral = {
  /**
   * Mock OCR response for PDF extraction
   */
  ocrResponse(pages: Array<{ markdown: string; images?: any[] }>) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'mistral-test',
        pages: pages.map((page, idx) => ({
          pageNumber: idx + 1,
          markdown: page.markdown,
          images: page.images || [],
        })),
      }),
    };
  },

  error(status: number, message: string) {
    return {
      ok: false,
      status,
      text: async () => message,
    };
  },
};

/**
 * BoardGameGeek API Response Builders
 */
export const bgg = {
  /**
   * Create BGG search results XML
   */
  searchResults(games: Array<{ id: string; name: string; year: number }>) {
    const items = games
      .map(
        (g) =>
          `  <item type="boardgame" id="${g.id}">
    <name type="primary" value="${g.name}"/>
    <yearpublished value="${g.year}"/>
  </item>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<items total="${games.length}">
${items}
</items>`;

    return {
      ok: true,
      status: 200,
      text: async () => xml,
    };
  },

  /**
   * Create BGG game details XML
   */
  gameDetails(game: {
    id: string;
    name: string;
    year: number;
    description?: string;
    minPlayers?: number;
    maxPlayers?: number;
    playingTime?: number;
    minAge?: number;
    designers?: string[];
    publishers?: string[];
    imageUrl?: string;
    thumbnailUrl?: string;
  }) {
    const {
      id,
      name,
      year,
      description = 'Test game description',
      minPlayers = 2,
      maxPlayers = 4,
      playingTime = 60,
      minAge = 10,
      designers = [],
      publishers = [],
      imageUrl = 'https://cf.geekdo-images.com/test.jpg',
      thumbnailUrl = 'https://cf.geekdo-images.com/thumb.jpg',
    } = game;

    const designerLinks = designers
      .map((d, i) => `    <link type="boardgamedesigner" id="${1000 + i}" value="${d}"/>`)
      .join('\n');
    const publisherLinks = publishers
      .map((p, i) => `    <link type="boardgamepublisher" id="${2000 + i}" value="${p}"/>`)
      .join('\n');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="${id}">
    <name type="primary" value="${name}"/>
    <yearpublished value="${year}"/>
    <description>${description}</description>
    <minplayers value="${minPlayers}"/>
    <maxplayers value="${maxPlayers}"/>
    <playingtime value="${playingTime}"/>
    <minage value="${minAge}"/>
    <image>${imageUrl}</image>
    <thumbnail>${thumbnailUrl}</thumbnail>
${designerLinks}
${publisherLinks}
  </item>
</items>`;

    return {
      ok: true,
      status: 200,
      text: async () => xml,
    };
  },

  error(status: number) {
    return {
      ok: false,
      status,
      text: async () => `BGG API Error ${status}`,
    };
  },
};

/**
 * Resend API Response Builders
 */
export const resend = {
  success(messageId: string = 'test-email-id') {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: messageId,
        from: 'test@example.com',
        to: ['user@example.com'],
        created_at: new Date().toISOString(),
      }),
    };
  },

  error(status: number, message: string) {
    return {
      ok: false,
      status,
      json: async () => ({ error: { message } }),
    };
  },
};

/**
 * Helper to set up common API mocks for a test
 *
 * @example
 * const mockFetch = setupAPIMocks({
 *   openai: {
 *     embeddings: ['test content'],
 *     chatCompletion: { questions: ['Q1', 'Q2'] }
 *   }
 * });
 */
export function setupAPIMocks(config: {
  openai?: {
    embeddings?: string[];
    chatCompletion?: string | object;
  };
  mistral?: {
    ocr?: Array<{ markdown: string; images?: any[] }>;
  };
  bgg?: {
    search?: Array<{ id: string; name: string; year: number }>;
    details?: any;
  };
}) {
  const mockFetch = createMockFetch();

  // Set up default responses based on config
  if (config.openai?.embeddings) {
    mockFetch.mockResolvedValue(openAI.embeddings(config.openai.embeddings));
  }
  if (config.openai?.chatCompletion) {
    mockFetch.mockResolvedValue(openAI.chatCompletion(config.openai.chatCompletion));
  }
  if (config.mistral?.ocr) {
    mockFetch.mockResolvedValue(mistral.ocrResponse(config.mistral.ocr));
  }
  if (config.bgg?.search) {
    mockFetch.mockResolvedValue(bgg.searchResults(config.bgg.search));
  }
  if (config.bgg?.details) {
    mockFetch.mockResolvedValue(bgg.gameDetails(config.bgg.details));
  }

  return mockFetch;
}

/**
 * Configure fetch mock to route specific URLs to specific responses
 * Useful for tests that call multiple external APIs
 *
 * @example
 * const mockFetch = createMockFetch();
 * routeAPICalls(mockFetch, {
 *   'api.openai.com/v1/embeddings': openAI.embeddings(['text']),
 *   'api.openai.com/v1/chat/completions': openAI.chatCompletion('response'),
 *   // Or use a function for dynamic routing:
 *   'api.openai.com/v1/chat/completions': (url, options) => {
 *     return options?.body?.stream ? streamingResponse : regularResponse;
 *   },
 *   'boardgamegeek.com/xmlapi2/search': bgg.searchResults([...])
 * });
 */
export function routeAPICalls(
  mockFetch: ReturnType<typeof vi.fn>,
  routes: Record<string, any | ((url: string, options?: RequestInit) => any)>
) {
  mockFetch.mockImplementation((url: string | URL | Request, ...args: any[]) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const options = args[0];

    for (const [pattern, handler] of Object.entries(routes)) {
      if (urlString.includes(pattern)) {
        // If handler is a function, call it with url and options
        const response = typeof handler === 'function' ? handler(urlString, options) : handler;
        return Promise.resolve(response);
      }
    }

    // Default: reject unhandled URLs
    return Promise.reject(new Error(`Unhandled fetch: ${urlString}`));
  });
}
