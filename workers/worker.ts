import type { ExportedHandler } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env } from './src/types';
import type { R2Bucket } from '@cloudflare/workers-types';
import { auth } from './src/middleware/auth';
import * as Sentry from '@sentry/cloudflare';

// Import API routes
import gamesRouter from './src/routes/api/games';
import authRouter from './src/routes/api/auth';
import resourcesRouter from './src/routes/api/resources';
import bggRouter from './src/routes/api/bgg';
import uploadRouter from './src/routes/api/upload';
import attachmentsRouter from './src/routes/api/attachments';
import healthRouter from './src/routes/api/health';
import queueHandler from './src/workers/resource-processor';
import cleanupJobsHandler from './src/workers/cleanup-stalled-jobs';
import { RESOURCE_SOURCE_FILENAME } from './src/lib/services/r2-storage';

/**
 * Validate required environment variables and bindings
 * Returns error response if validation fails, null if all checks pass
 */
function validateEnvironment(env: Env): Response | null {
  const errors: string[] = [];

  // Check secrets (string values)
  if (!env.OPENAI_API_KEY) errors.push('OPENAI_API_KEY is required');
  if (!env.MISTRAL_API_KEY) errors.push('MISTRAL_API_KEY is required');
  if (!env.JWT_SECRET) errors.push('JWT_SECRET is required');

  // Check bindings (objects)
  if (!env.DB) errors.push('DB binding is required');
  if (!env.VECTORIZE) errors.push('VECTORIZE binding is required');
  if (!env.FILES) errors.push('FILES (R2) binding is required');
  if (!env.ASSETS) errors.push('ASSETS binding is required');
  if (!env.RATE_LIMIT_KV) errors.push('RATE_LIMIT_KV binding is required');
  if (!env.JOB_STATUS_KV) errors.push('JOB_STATUS_KV binding is required');
  if (!env.RESOURCE_QUEUE) errors.push('RESOURCE_QUEUE binding is required');

  if (errors.length > 0) {
    console.error('[Environment Validation] Missing required environment variables:', errors);
    return new Response(
      JSON.stringify({
        error: 'Server configuration error',
        details: 'Missing required environment variables',
        missing: errors,
        hint: 'Check wrangler.toml bindings and secrets configuration',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

// Create Hono app for API routes
const honoApp = new Hono<{ Bindings: Env }>();

// Global middleware
honoApp.use('*', logger());
honoApp.use('*', cors());
honoApp.use('*', prettyJSON());
honoApp.use('*', auth);

// Health check
honoApp.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
  });
});

// API routes
honoApp.route('/api/health', healthRouter);
honoApp.route('/api/games', gamesRouter);
honoApp.route('/api/auth', authRouter);
honoApp.route('/api/resources', resourcesRouter);
honoApp.route('/api/bgg', bggRouter);
honoApp.route('/api/attachments', attachmentsRouter);
honoApp.route('/api/images', uploadRouter);

// R2 file serving
async function serveR2Object(c: Context<{ Bindings: Env }>, key: string) {
  if (!key || key.includes('..')) {
    return c.json({ error: 'Invalid key' }, 400);
  }

  let object = await c.env.FILES.get(key);

  if (!object) {
    const resourceRootMatch = key.match(/^resources\/([^/]+)$/);
    if (resourceRootMatch) {
      const altKey = `${key}/${RESOURCE_SOURCE_FILENAME}`;
      const altObject = await c.env.FILES.get(altKey);
      if (altObject) {
        object = altObject;
        key = altKey;
      }
    }
  }

  if (!object) {
    const fallbackKey = await findAttachmentVariantKey(c.env.FILES, key);
    if (fallbackKey) {
      const fallbackObject = await c.env.FILES.get(fallbackKey);
      if (fallbackObject) {
        object = fallbackObject;
        key = fallbackKey;
      }
    }
  }

  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  const metadata = object.httpMetadata ?? {};

  headers.set('Cache-Control', metadata.cacheControl || 'public, max-age=31536000, immutable');
  headers.set('Content-Type', metadata.contentType || 'application/octet-stream');
  if (metadata.contentDisposition) {
    headers.set('Content-Disposition', metadata.contentDisposition);
  }
  if (metadata.contentLanguage) {
    headers.set('Content-Language', metadata.contentLanguage);
  }
  if (metadata.contentEncoding) {
    headers.set('Content-Encoding', metadata.contentEncoding);
  }
  if (object.size !== undefined) {
    headers.set('Content-Length', object.size.toString());
  }
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }

  if (c.req.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  return new Response(object.body, { headers });
}

async function findAttachmentVariantKey(bucket: R2Bucket, key: string): Promise<string | null> {
  const match = key.match(/^resources\/([^/]+)\/attachments\/(.+)$/);
  if (!match) {
    return null;
  }

  const [, resourceId, filename] = match;
  const baseWithoutExt = filename.replace(/\.[^.]+$/, '');
  const prefix = `resources/${resourceId}/attachments/${baseWithoutExt}`;

  const listed = await bucket.list({ prefix, limit: 5 });
  if (!listed.objects.length) {
    return null;
  }

  return listed.objects[0].key;
}

honoApp.get('/uploads/*', async (c) => {
  const key = c.req.path.replace('/uploads/', '');
  return serveR2Object(c, key);
});

// Import React Router build - this may not exist during development
// Worker will gracefully fall back to static assets if the build is missing
let reactRouterBuild: any = null;
let reactRouterError: Error | null = null;

try {
  // @ts-ignore - Build will be available after running `pnpm build:client`
  reactRouterBuild = require('./build/server/index.js');
} catch (error) {
  reactRouterError = error instanceof Error ? error : new Error(String(error));
  // Don't log here - will log on first request to avoid spam during startup
}

const worker: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Validate environment on first request
    const envError = validateEnvironment(env);
    if (envError) {
      return envError;
    }

    const url = new URL(request.url);

    // Route API requests and uploads to Hono
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/uploads/') ||
        url.pathname === '/health') {
      return honoApp.fetch(request, env, ctx);
    }

    // All other requests go to React Router if available
    if (reactRouterBuild?.default?.fetch) {
      try {
        return await reactRouterBuild.default.fetch(request, env, ctx);
      } catch (error) {
        console.error('[React Router] Handler error:', error instanceof Error ? error.message : String(error));
        // Fall through to ASSETS on error
      }
    } else if (reactRouterError && url.pathname === '/') {
      // Only log once on first page load
      console.warn('[React Router] Build not available:', reactRouterError.message);
      console.warn('[React Router] Serving static assets only. Run `pnpm build:client` to build the app.');
    }

    // Fallback to ASSETS if React Router is not available or failed
    return env.ASSETS.fetch(request);
  },
  queue: queueHandler.queue,
  scheduled: cleanupJobsHandler.scheduled,
};

// Wrap worker with Sentry for error tracking and performance monitoring
export default Sentry.withSentry(
  (env: Env) => {
    // Only initialize Sentry if DSN is configured
    if (!env.SENTRY_DSN) {
      return {};
    }

    return {
      dsn: env.SENTRY_DSN,
      environment: env.ENVIRONMENT || 'development',
      tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
      integrations: [
        // Automatically instrument Vercel AI SDK (ai package)
        // This captures spans for AI model calls, tool executions, and streaming
        Sentry.vercelAIIntegration({
          recordInputs: true,   // Record prompts/inputs
          recordOutputs: true,  // Record completions/outputs
        }),
      ],
    };
  },
  worker
);
