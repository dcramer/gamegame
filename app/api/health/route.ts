/**
 * Health check endpoint
 * Tests database connectivity and returns service status
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';

export async function GET() {
  const startTime = Date.now();

  try {
    // Test database connectivity by querying games
    await db.select().from(games).limit(1);

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
      },
      responseTime: `${responseTime}ms`,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'error',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: `${responseTime}ms`,
      },
      { status: 503 }
    );
  }
}
