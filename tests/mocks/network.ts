import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';

type AllowMatcher = (url: URL) => boolean;

const DEFAULT_ALLOWED_MATCHERS: AllowMatcher[] = [
  (url) => url.hostname === 'localhost',
  (url) => url.hostname === '127.0.0.1',
  (url) => url.hostname === '[::1]',
];

const GUARDED_PROTOCOLS = new Set(['http:', 'https:']);

let perTestAllowMatchers: AllowMatcher[] = [...DEFAULT_ALLOWED_MATCHERS];

const MOCK_IMAGE_ANALYSIS_RESULT = {
  description: 'Mocked description of the board game image content.',
  quality: 'good' as const,
  relevant: true,
  type: 'diagram' as const,
  ocrText: 'Mock OCR text',
};

const MOCK_QUESTIONS = [
  'How do I set up the starting pieces?',
  'What triggers the end of the round?',
  'How are bonus tokens scored?',
];

const MOCK_ANSWER_TYPES = ['setup_instructions', 'rule_clarification'];

const createDefaultHandlers = (): HttpHandler[] => [
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const payload = await parseJsonBody(request);
    return HttpResponse.json(buildChatCompletionPayload(payload));
  }),
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    const payload = await parseJsonBody(request);
    return HttpResponse.json(buildEmbeddingPayload(payload));
  }),
];

const guardHandler = http.all('*', async ({ request }) => {
  const url = new URL(request.url);

  if (!GUARDED_PROTOCOLS.has(url.protocol)) {
    return fetch(request);
  }

  const isAllowed = perTestAllowMatchers.some((matcher) => {
    try {
      return matcher(url);
    } catch {
      return false;
    }
  });

  if (isAllowed) {
    return fetch(request);
  }

  throw new Error(
    [
      'Blocked unmocked network request during tests.',
      `URL: ${url.toString()}`,
      'Mock this request with MSW or call allowNetworkRequests() to opt-in to specific domains.',
    ].join(' '),
  );
});

const defaultHandlers = createDefaultHandlers();
export const networkServer = setupServer(...defaultHandlers, guardHandler);

beforeAll(() => {
  networkServer.listen({ onUnhandledRequest: 'bypass' });
});

beforeEach(() => {
  perTestAllowMatchers = [...DEFAULT_ALLOWED_MATCHERS];
});

afterEach(() => {
  networkServer.resetHandlers();
});

afterAll(() => {
  networkServer.close();
});

type AllowOptions = {
  hosts?: string | string[];
  urls?: (string | RegExp)[];
  matchers?: AllowMatcher[];
};

const toArray = <T>(value?: T | T[]): T[] => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

export function allowNetworkRequests(options: AllowOptions = {}) {
  const hostMatchers = toArray(options.hosts).map<AllowMatcher>((host) => (url) => url.hostname === host);

  const urlMatchers = toArray(options.urls).map<AllowMatcher>((pattern) => {
    if (pattern instanceof RegExp) {
      return (url) => pattern.test(url.toString());
    }
    return (url) => url.toString().startsWith(pattern);
  });

  perTestAllowMatchers.push(...hostMatchers, ...urlMatchers, ...(options.matchers ?? []));
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function buildChatCompletionPayload(payload: any) {
  const model = payload?.model ?? 'gpt-5-mini';
  const firstMessage = payload?.messages?.[0];
  const messageContent = firstMessage?.content;

  if (Array.isArray(messageContent)) {
    // Image analysis prompts send mixed content arrays
    return createChatResponse(model, {
      content: JSON.stringify(MOCK_IMAGE_ANALYSIS_RESULT),
    });
  }

  const prompt = typeof messageContent === 'string' ? messageContent.toLowerCase() : '';

  if (prompt.includes('return only a json object') && prompt.includes('answer types')) {
    return createChatResponse(model, {
      content: JSON.stringify({ answerTypes: MOCK_ANSWER_TYPES }),
    });
  }

  if (prompt.includes('return only a json object') && prompt.includes('"questions"')) {
    return createChatResponse(model, {
      content: JSON.stringify({ questions: MOCK_QUESTIONS }),
      parsed: { questions: MOCK_QUESTIONS },
    });
  }

  if (prompt.includes('rate how well this content answers the query')) {
    return createChatResponse(model, {
      content: '78',
    });
  }

  return createChatResponse(model, {
    content: JSON.stringify({ result: 'Mock completion response' }),
  });
}

function createChatResponse(model: string, message: { content: string; parsed?: unknown }) {
  return {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    created: Date.now(),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

function buildEmbeddingPayload(payload: any) {
  const inputs = Array.isArray(payload?.input) ? payload.input : [payload?.input ?? ''];
  const dimensions = 1536;

  return {
    object: 'list',
    model: payload?.model ?? 'text-embedding-3-small',
    data: inputs.map((_: string, index: number) => ({
      object: 'embedding',
      index,
      embedding: createMockEmbedding(dimensions),
    })),
    usage: {
      prompt_tokens: 0,
      total_tokens: 0,
    },
  };
}

function createMockEmbedding(dimensions: number) {
  return Array.from({ length: dimensions }, (_: unknown, i: number) => (i % 2 === 0 ? 0.01 : -0.01));
}

/**
 * Helper to mock OpenAI chat completion responses in tests
 * Uses MSW to override the default handler for specific test cases
 *
 * @example
 * mockChatCompletion({ questions: ['Q1', 'Q2', 'Q3'] });
 * mockChatCompletion('Simple text response');
 */
export function mockChatCompletion(content: string | object, options?: { model?: string }) {
  const stringContent = typeof content === 'string' ? content : JSON.stringify(content);
  const model = options?.model ?? 'gpt-5-mini';

  networkServer.use(
    http.post('https://api.openai.com/v1/chat/completions', () => {
      return HttpResponse.json(createChatResponse(model, {
        content: stringContent,
        parsed: typeof content === 'object' ? content : undefined,
      }));
    })
  );
}

/**
 * Helper to mock OpenAI embeddings responses in tests
 *
 * @example
 * mockEmbeddings(['text1', 'text2'], { dimensions: 1536 });
 * mockEmbeddings(['text'], { dimensions: 512 }); // For testing dimension validation
 */
export function mockEmbeddings(texts: string[], options?: { dimensions?: number }) {
  const dimensions = options?.dimensions ?? 1536;

  networkServer.use(
    http.post('https://api.openai.com/v1/embeddings', () => {
      return HttpResponse.json({
        object: 'list',
        model: 'text-embedding-3-small',
        data: texts.map((_, index) => ({
          object: 'embedding',
          index,
          embedding: createMockEmbedding(dimensions),
        })),
        usage: {
          prompt_tokens: 0,
          total_tokens: 0,
        },
      });
    })
  );
}

/**
 * Helper to mock OpenAI API errors in tests
 *
 * @example
 * mockOpenAIError(500, 'Internal Server Error');
 * mockOpenAIError(429, 'Rate limit exceeded');
 */
export function mockOpenAIError(status: number, message: string, endpoint: 'chat' | 'embeddings' = 'chat') {
  const url = endpoint === 'chat'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.openai.com/v1/embeddings';

  networkServer.use(
    http.post(url, () => {
      return HttpResponse.json(
        { error: { message, type: 'api_error' } },
        { status }
      );
    })
  );
}

export { http, HttpResponse } from 'msw';
