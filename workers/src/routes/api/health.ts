import { Hono } from 'hono';
import type { Env } from '@/types';
import { getDb, games } from '@/lib/db';

const healthRouter = new Hono<{ Bindings: Env }>();

/**
 * Health check endpoint
 * Tests database connectivity and returns service status
 */
healthRouter.get('/', async (c) => {
  const startTime = Date.now();

  try {
    // Test database connectivity by querying games
    const db = getDb(c.env.DB);
    await db.select().from(games).limit(1).all();

    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
      },
      responseTime: `${responseTime}ms`,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return c.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'error',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: `${responseTime}ms`,
      },
      503
    );
  }
});

export default healthRouter;
