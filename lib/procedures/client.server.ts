/**
 * Server-Side oRPC Client
 * For use in Server Components (direct procedure calls, no HTTP)
 */

import 'server-only';
import { createRouterClient } from '@orpc/server';
import { router } from './router';

/**
 * Server client - calls procedures directly without HTTP
 * Use this in Server Components
 *
 * Context is provided per-request via middleware in procedures
 */
export const serverClient = createRouterClient({
  router,
  context: {},
});
