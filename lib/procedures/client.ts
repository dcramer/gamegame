/**
 * Browser oRPC Client
 * For use in Client Components (HTTP requests to /api/rpc)
 */

import { createORPCClient } from '@orpc/client';
import { ORPCLink } from '@orpc/client/fetch';
import type { Router } from './router';

/**
 * Browser client - makes HTTP requests to /api/rpc
 * Use this in Client Components
 */
const link = new ORPCLink({
  url: typeof window !== 'undefined'
    ? new URL('/api/rpc', window.location.origin).toString()
    : '/api/rpc',
});

export const orpc = createORPCClient<Router>(link);
