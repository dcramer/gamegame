import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env } from './types';
import { auth } from './middleware/auth';

// Import API routes
import chatRouter from './routes/api/chat';
import gamesRouter from './routes/api/games';
import authRouter from './routes/api/auth';
import resourcesRouter from './routes/api/resources';
import bggRouter from './routes/api/bgg';
import healthRouter from './routes/api/health';
import uploadRouter from './routes/api/upload';
import attachmentsRouter from './routes/api/attachments';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', prettyJSON());
app.use('*', auth); // Add user to context if authenticated

// API routes
app.route('/api/health', healthRouter);
app.route('/api', chatRouter);
app.route('/api/games', gamesRouter);
app.route('/api/auth', authRouter);
app.route('/api/resources', resourcesRouter);
app.route('/api/bgg', bggRouter);
app.route('/api/upload', uploadRouter);
app.route('/api/attachments', attachmentsRouter);

// Serve static assets first
app.get('/assets/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.url);
});

// Serve index.html for all other routes (SPA routing)
app.get('*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/index.html';
  return c.env.ASSETS.fetch(url.toString());
});

// Export main app as default
export default app;

// NOTE: Queue consumer is NOT exported here to avoid loading langchain dependencies
// during tests. The queue consumer is only needed in production (src/index.tsx).
