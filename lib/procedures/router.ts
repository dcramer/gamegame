/**
 * oRPC Router
 * Combined router exposing all procedures
 */

import * as gamesProcedures from './games';
import * as resourcesProcedures from './resources';
import * as attachmentsProcedures from './attachments';
import * as bggProcedures from './bgg';

/**
 * Convert procedures to callable form for server-side direct invocation
 * In oRPC v1.x, procedures need to be explicitly made callable via .callable()
 * to be invoked directly without HTTP layer
 */
function makeCallable(procedures: Record<string, any>) {
  const result: Record<string, any> = {};
  for (const [key, proc] of Object.entries(procedures)) {
    if (proc && typeof proc.callable === 'function') {
      // Pass empty context - middleware will populate it
      result[key] = proc.callable({});
    } else {
      result[key] = proc;
    }
  }
  return result;
}

export const router = {
  games: gamesProcedures,
  resources: resourcesProcedures,
  attachments: attachmentsProcedures,
  bgg: bggProcedures,
};

/**
 * Callable version of router for server-side client
 * Used by Server Components to call procedures directly without HTTP overhead
 */
export const callableRouter = {
  games: makeCallable(gamesProcedures),
  resources: makeCallable(resourcesProcedures),
  attachments: makeCallable(attachmentsProcedures),
  bgg: makeCallable(bggProcedures),
};

export type Router = typeof router;
export type CallableRouter = typeof callableRouter;
