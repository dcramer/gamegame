/**
 * Tests for Health Check API
 * GET /api/health
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';

describe('GET /api/health', () => {
  it('should return healthy status when database is accessible', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: 'healthy',
      checks: {
        database: 'ok',
      },
    });
    expect(data.timestamp).toBeDefined();
    expect(data.responseTime).toMatch(/^\d+ms$/);
  });

  it('should include response time in milliseconds', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.responseTime).toBeDefined();
    const ms = parseInt(data.responseTime.replace('ms', ''), 10);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(5000); // Should be fast
  });

  it('should have ISO 8601 timestamp', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    const timestamp = new Date(data.timestamp);
    expect(timestamp.toISOString()).toBe(data.timestamp);
  });

  it('should actually query the database', async () => {
    // Ensure database connection works by running a query
    const result = await db.select().from(games).limit(1);
    expect(Array.isArray(result)).toBe(true);

    // Health endpoint should also work
    const response = await GET();
    const data = await response.json();

    expect(data.status).toBe('healthy');
  });
});
