/**
 * Tests for Cleanup Stalled Jobs Workflow API Route
 * GET /api/workflows/cleanup-stalled-jobs - Trigger cleanup (Cron or admin)
 * POST /api/workflows/cleanup-stalled-jobs - Manual trigger (Cron or admin)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GET as getTrigger, POST as postTrigger } from '@/app/api/workflows/cleanup-stalled-jobs/route';
import { NextRequest } from 'next/server';

// Mock the workflow function to prevent actual execution
vi.mock('@/lib/workflows/cleanup-stalled-jobs/index', () => ({
  cleanupStalledJobsWorkflow: vi.fn(() =>
    Promise.resolve({
      success: true,
      totalJobs: 10,
      stalledJobs: 3,
      cleanedJobs: 3,
      failedUpdates: 0,
      errors: [],
    })
  ),
}));

// Mock requireAdmin to control authentication
vi.mock('@/lib/auth/helpers', () => ({
  requireAdmin: vi.fn(),
}));

describe.sequential('Cleanup Stalled Jobs Workflow API', () => {
  let originalCronSecret: string | undefined;

  beforeEach(() => {
    // Save and set CRON_SECRET for tests
    originalCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret-123';

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original CRON_SECRET
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  describe('GET /api/workflows/cleanup-stalled-jobs', () => {
    it('should reject unauthorized requests', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs');
      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow requests with valid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.totalJobs).toBe(10);
      expect(data.stalledJobs).toBe(3);
      expect(data.cleanedJobs).toBe(3);
    });

    it('should reject requests with invalid CRON_SECRET', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow admin users without CRON_SECRET', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs');
      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
    });

    it('should trigger cleanup workflow and return results', async () => {
      const { cleanupStalledJobsWorkflow } = await import('@/lib/workflows/cleanup-stalled-jobs/index');

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(cleanupStalledJobsWorkflow).toHaveBeenCalled();
      expect(data).toMatchObject({
        success: true,
        totalJobs: 10,
        stalledJobs: 3,
        cleanedJobs: 3,
        failedUpdates: 0,
        errors: [],
      });
    });

    it('should handle workflow errors', async () => {
      const { cleanupStalledJobsWorkflow } = await import('@/lib/workflows/cleanup-stalled-jobs/index');
      (cleanupStalledJobsWorkflow as any).mockRejectedValueOnce(new Error('Workflow failed'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to run stalled job cleanup');
      expect(data.details).toBe('Workflow failed');
    });
  });

  describe('POST /api/workflows/cleanup-stalled-jobs', () => {
    it('should reject unauthorized requests', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        method: 'POST',
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow requests with valid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should allow admin users without CRON_SECRET', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        method: 'POST',
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
    });

    it('should trigger cleanup workflow and return results', async () => {
      const { cleanupStalledJobsWorkflow } = await import('@/lib/workflows/cleanup-stalled-jobs/index');

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(cleanupStalledJobsWorkflow).toHaveBeenCalled();
      expect(data).toMatchObject({
        success: true,
        totalJobs: 10,
        stalledJobs: 3,
        cleanedJobs: 3,
      });
    });

    it('should handle workflow errors', async () => {
      const { cleanupStalledJobsWorkflow } = await import('@/lib/workflows/cleanup-stalled-jobs/index');
      (cleanupStalledJobsWorkflow as any).mockRejectedValueOnce(new Error('Workflow execution failed'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-stalled-jobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to run stalled job cleanup');
      expect(data.details).toBe('Workflow execution failed');
    });
  });
});
