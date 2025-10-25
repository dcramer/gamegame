import { Hono } from 'hono';
import type { Context } from 'hono';
import type { R2Bucket } from '@cloudflare/workers-types';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env } from './types';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { auth, type AuthUser } from './middleware/auth';
import { RESOURCE_SOURCE_FILENAME } from './lib/services/r2-storage';

// Import API routes
import gamesRouter from './routes/api/games';
import authRouter from './routes/api/auth';
import resourcesRouter from './routes/api/resources';
import bggRouter from './routes/api/bgg';
import uploadRouter from './routes/api/upload';
import attachmentsRouter from './routes/api/attachments';
import healthRouter from './routes/api/health';
import queueHandler from './workers/resource-processor';

type Variables = {
  user?: AuthUser;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    // Allow localhost for development
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin || '*';
    }
    // Add your production domains here
    const allowedOrigins = [
      'https://gamegame.pages.dev',
      'https://www.gamegame.app',
      'https://gamegame.app',
    ];
    return allowedOrigins.includes(origin) ? origin : null;
  },
  credentials: true,
}));
app.use('*', prettyJSON());
// Auth middleware - skip for static assets
app.use('*', async (c, next) => {
  // Skip auth for static assets and health checks
  if (c.req.path.startsWith('/assets/') ||
      c.req.path.startsWith('/uploads/') ||
      c.req.path === '/health') {
    return next();
  }
  return auth(c, next);
});

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
  });
});

// API routes
app.route('/api/health', healthRouter);
app.route('/api/games', gamesRouter);
app.route('/api/auth', authRouter);
app.route('/api/resources', resourcesRouter);
app.route('/api/bgg', bggRouter);
app.route('/api/attachments', attachmentsRouter);
app.route('/api/images', uploadRouter); // Mounts /images and / as /api/images/upload and /api/images

// Serve static assets first
app.get('/assets/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.url);
});

async function serveR2Object(c: Context<{ Bindings: Env; Variables: Variables }>, key: string) {
  // Decode URL encoding first to catch encoded path traversal attempts
  const decodedKey = decodeURIComponent(key);

  // Reject dangerous patterns: empty, path traversal, absolute paths, backslashes
  if (!decodedKey ||
      decodedKey.includes('..') ||
      decodedKey.startsWith('/') ||
      decodedKey.includes('\\')) {
    return c.json({ error: 'Invalid key' }, 400);
  }

  // Normalize to prevent /./ patterns and multiple slashes
  const normalizedKey = decodedKey.replace(/\/+/g, '/').replace(/\/\./g, '/');

  // Use normalized key for all operations
  key = normalizedKey;

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

  // Cast needed due to ReadableStream type mismatch between Workers and DOM types
  return new Response(object.body as BodyInit, { headers });
}

async function findAttachmentVariantKey(bucket: R2Bucket, key: string): Promise<string | null> {
  const match = key.match(/^resources\/([^/]+)\/attachments\/(.+)$/);
  if (!match) {
    return null;
  }

  const [ , resourceId, filename ] = match;
  const baseWithoutExt = filename.replace(/\.[^.]+$/, '');
  const prefix = `resources/${resourceId}/attachments/${baseWithoutExt}`;

  const listed = await bucket.list({ prefix, limit: 5 });
  if (!listed.objects.length) {
    return null;
  }

  return listed.objects[0].key;
}

// Preferred canonical file routes
// Primary uploads route (preferred for all file access)
app.get('/uploads/*', async (c) => {
  const key = c.req.path.replace('/uploads/', '');
  return serveR2Object(c, key);
});


// Serve index.html for all other routes (SPA routing)
app.get('*', async (c) => {
  // Try to serve the requested asset first (supports root-level files from Vite public/)
  const directResponse = await c.env.ASSETS.fetch(c.req.url);
  if (directResponse.status !== 404) {
    return directResponse;
  }

  const url = new URL(c.req.url);
  url.pathname = '/index.html';
  return c.env.ASSETS.fetch(url.toString());
});

export const workerApp = app;

export default {
  // @ts-expect-error - Hono's fetch signature (with optional params) is compatible but doesn't match ExportedHandler's exact type
  fetch: app.fetch,
  queue: queueHandler.queue,
} satisfies ExportedHandler<Env>;
