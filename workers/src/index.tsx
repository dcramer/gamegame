import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env } from './types';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { auth } from './middleware/auth';

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

// Serve uploaded files from R2
app.get('/uploads/*', async (c) => {
  const path = c.req.path.replace('/uploads/', '');
  const object = await c.env.FILES.get(path);

  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
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
