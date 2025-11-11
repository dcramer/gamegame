import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

type AllowMatcher = (url: URL) => boolean;

const DEFAULT_ALLOWED_MATCHERS: AllowMatcher[] = [
  (url) => url.hostname === 'localhost',
  (url) => url.hostname === '127.0.0.1',
  (url) => url.hostname === '[::1]',
];

const GUARDED_PROTOCOLS = new Set(['http:', 'https:']);

let perTestAllowMatchers: AllowMatcher[] = [...DEFAULT_ALLOWED_MATCHERS];

const guardHandler = http.all('*', async ({ request }) => {
  const url = new URL(request.url);

  if (!GUARDED_PROTOCOLS.has(url.protocol)) {
    return HttpResponse.fetch(request);
  }

  const isAllowed = perTestAllowMatchers.some((matcher) => {
    try {
      return matcher(url);
    } catch {
      return false;
    }
  });

  if (isAllowed) {
    return HttpResponse.fetch(request);
  }

  throw new Error(
    [
      'Blocked unmocked network request during tests.',
      `URL: ${url.toString()}`,
      'Mock this request with MSW or call allowNetworkRequests() to opt-in to specific domains.',
    ].join(' '),
  );
});

export const networkServer = setupServer(guardHandler);

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

export { http, HttpResponse } from 'msw';
