/**
 * Mock for next/server to allow NextAuth to work in tests
 * This prevents the "Cannot find module 'next/server'" error
 */

export class NextRequest {
  constructor(public url: string, public init?: RequestInit) {}

  get headers() {
    return new Headers();
  }

  get cookies() {
    return {
      get: () => null,
      set: () => {},
      delete: () => {},
    };
  }
}

export class NextResponse {
  static json(data: any, init?: ResponseInit) {
    return new Response(JSON.stringify(data), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
  }

  static redirect(url: string, status?: number) {
    return new Response(null, {
      status: status || 302,
      headers: {
        Location: url,
      },
    });
  }
}

export function userAgent() {
  return {
    ua: 'test-agent',
    browser: { name: 'test' },
    device: { type: 'desktop' },
    engine: { name: 'test' },
    os: { name: 'test' },
    cpu: { architecture: 'test' },
  };
}
