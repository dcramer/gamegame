import { Hono } from 'hono';
import type { Context } from 'hono';
import type { R2Bucket } from '@cloudflare/workers-types';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env } from './types';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { auth } from './middleware/auth';
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

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', prettyJSON());
app.use('*', auth); // Add user to context if authenticated

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

const worker: ExportedHandler<Env> = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  queue: queueHandler.queue,
};

export default worker;
