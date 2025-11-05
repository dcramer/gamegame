/**
 * Mock next/server before any imports to avoid NextAuth errors in tests
 * This must be loaded BEFORE any other setup files
 */
import { vi } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class NextRequest {
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
  },

  NextResponse: class NextResponse {
    static json(data: any, init?: ResponseInit) {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init?.headers || {}),
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
  },

  userAgent: () => ({
    ua: 'test-agent',
    browser: { name: 'test' },
    device: { type: 'desktop' },
    engine: { name: 'test' },
    os: { name: 'test' },
    cpu: { architecture: 'test' },
  }),
}));
