import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb } from '@/test-utils/setup';

describe('Health Endpoint Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return healthy status when database is accessible', async () => {
    const response = await SELF.fetch('http://localhost/api/health');

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.status).toBe('healthy');
    expect(data.checks.database).toBe('ok');
    expect(typeof data.responseTime).toBe('string');
  });

  it('should include response time metric', async () => {
    const response = await SELF.fetch('http://localhost/api/health');

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.responseTime).toBeDefined();
    expect(data.responseTime).toMatch(/\d+ms/);
  });
});
