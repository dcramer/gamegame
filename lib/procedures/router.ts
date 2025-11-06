/**
 * oRPC Router
 * Combined router exposing all procedures
 */

import * as gamesProcedures from './games';
import * as resourcesProcedures from './resources';
import * as attachmentsProcedures from './attachments';
import * as bggProcedures from './bgg';
import * as workflowsProcedures from './workflows';

export const router = {
  games: gamesProcedures,
  resources: resourcesProcedures,
  attachments: attachmentsProcedures,
  bgg: bggProcedures,
  workflows: workflowsProcedures,
};

export type Router = typeof router;
