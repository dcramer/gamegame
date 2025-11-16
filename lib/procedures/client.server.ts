/**
 * Server-Side oRPC Client
 * For use in Server Components (direct procedure calls, no HTTP)
 */

import 'server-only';
import { callableRouter } from './router';

/**
 * Server client - calls procedures directly without HTTP
 * Use this in Server Components
 *
 * Context is provided per-request via middleware in procedures
 */
export const serverClient = callableRouter;
