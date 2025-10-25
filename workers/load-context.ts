import type { PlatformProxy } from 'wrangler'
import type { Env } from './src/types'

type Cloudflare = Omit<PlatformProxy<Env>, 'dispose'>

type GetLoadContextArgs = {
  request: Request
  context: { cloudflare: Cloudflare }
}

/**
 * Universal API client that works in both client and server contexts
 * - Client-side: Base URL is empty (relative URLs, Vite proxies to :8787)
 * - Server-side: Base URL is http://localhost:8787 (Node.js fetch requires absolute URLs)
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(private request?: Request) {
    // Server-side: Node.js fetch requires absolute URLs
    // Client-side: Use empty string for relative URLs
    this.baseUrl = request ? 'http://localhost:8787' : '';
  }

  /**
   * Fetch from API routes with automatic authentication
   * @param path - API route path WITHOUT /api prefix (e.g., '/games', '/resources/:id')
   *                Path will be prefixed with '/api' automatically
   */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}/api${path}`;

    // Server-side: forward cookies from the loader's request
    if (this.request) {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          cookie: this.request.headers.get('cookie') || '',
        },
      });
    }

    // Client-side: include credentials (cookies) automatically
    return fetch(url, {
      ...init,
      credentials: 'include',
    });
  }
}

// Export singleton for client-side use
export const apiClient = new ApiClient();

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: Cloudflare
    api: ApiClient
  }
}

export function getLoadContext({ request, context }: GetLoadContextArgs) {
  return {
    ...context,
    api: new ApiClient(request),
  }
}
