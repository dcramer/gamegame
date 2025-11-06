/**
 * oRPC OpenAPI Handler
 * Provides RESTful API endpoints with OpenAPI 3.1.1 specification
 * Includes Scalar UI documentation at /api/v0
 */

import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { ZodSmartCoercionPlugin, ZodToJsonSchemaConverter } from '@orpc/zod';
import { router } from '@/lib/procedures/router';

const handler = new OpenAPIHandler(router, {
  plugins: [
    new ZodSmartCoercionPlugin(),
    // Temporarily disabled to debug
    // new OpenAPIReferencePlugin({
    //   docsProvider: 'scalar', // Use Scalar UI (default)
    //   schemaConverters: [new ZodToJsonSchemaConverter()],
    //   specGenerateOptions: {
    //     info: {
    //       title: 'GameGame API',
    //       version: '0.1.0',
    //       description:
    //         'RESTful API for GameGame - LLM-powered board game assistant. Get instant answers to board game rules.',
    //     },
    //     servers: [
    //       {
    //         url: '/api/v0',
    //         description: 'Development server',
    //       },
    //     ],
    //   },
    // }),
  ],
});

async function handleRequest(request: Request) {
  try {
    const { response } = await handler.handle(request, {
      prefix: '/api/v0',
      context: {},
    });

    return response ?? new Response('Not found', { status: 404 });
  } catch (error) {
    console.error('[OpenAPI Handler] Error:', error);
    if (error instanceof Error) {
      console.error('[OpenAPI Handler] Stack:', error.stack);
    }
    throw error;
  }
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
