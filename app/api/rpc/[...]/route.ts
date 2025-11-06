/**
 * oRPC RPC Handler
 * Handles type-safe RPC requests from Client Components
 * Uses proprietary RPC protocol for efficient serialization
 */

import { RPCHandler } from '@orpc/server/fetch';
import { router } from '@/lib/procedures/router';

const handler = new RPCHandler(router);

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/api/rpc',
    context: {},
  });

  return response ?? new Response('Not found', { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
