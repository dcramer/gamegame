/**
 * Tests for Cleanup Orphaned Blobs Workflow API Route
 * GET /api/workflows/cleanup-orphaned-blobs - Trigger cleanup (Cron or admin)
 * POST /api/workflows/cleanup-orphaned-blobs - Manual trigger (Cron or admin)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GET as getTrigger, POST as postTrigger } from '@/app/api/workflows/cleanup-orphaned-blobs/route';
import { NextRequest } from 'next/server';

// Mock the workflow function to prevent actual execution
vi.mock('@/lib/workflows/cleanup-orphaned-blobs/index', () => ({
  cleanupOrphanedBlobsWorkflow: vi.fn(() =>
    Promise.resolve({
      success: true,
      orphanedCount: 5,
      deletedCount: 5,
      failedDeletions: [],
    })
  ),
}));

// Mock requireAdmin to control authentication
vi.mock('@/lib/auth/helpers', () => ({
  requireAdmin: vi.fn(),
}));

describe.sequential('Cleanup Orphaned Blobs Workflow API', () => {
  let originalCronSecret: string | undefined;

  beforeEach(() => {
    // Save and set CRON_SECRET for tests
    originalCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret-456';

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

  describe('GET /api/workflows/cleanup-orphaned-blobs', () => {
    it('should reject unauthorized requests', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs');
      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow requests with valid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-456',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.orphanedCount).toBe(5);
      expect(data.deletedCount).toBe(5);
      expect(data.failedDeletions).toEqual([]);
    });

    it('should reject requests with invalid CRON_SECRET', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
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

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs');
      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
    });

    it('should trigger cleanup workflow and return results', async () => {
      const { cleanupOrphanedBlobsWorkflow } = await import('@/lib/workflows/cleanup-orphaned-blobs/index');

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-456',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(cleanupOrphanedBlobsWorkflow).toHaveBeenCalled();
      expect(data).toMatchObject({
        success: true,
        orphanedCount: 5,
        deletedCount: 5,
        failedDeletions: [],
      });
    });

    it('should handle workflow errors', async () => {
      const { cleanupOrphanedBlobsWorkflow } = await import('@/lib/workflows/cleanup-orphaned-blobs/index');
      (cleanupOrphanedBlobsWorkflow as any).mockRejectedValueOnce(new Error('Blob cleanup failed'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-456',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to run orphaned blob cleanup');
      expect(data.details).toBe('Blob cleanup failed');
    });

    it('should handle workflows with failed deletions', async () => {
      const { cleanupOrphanedBlobsWorkflow } = await import('@/lib/workflows/cleanup-orphaned-blobs/index');
      (cleanupOrphanedBlobsWorkflow as any).mockResolvedValueOnce({
        success: true,
        orphanedCount: 10,
        deletedCount: 8,
        failedDeletions: ['blob-key-1', 'blob-key-2'],
      });

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        headers: {
          authorization: 'Bearer test-cron-secret-456',
        },
      });

      const response = await getTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.orphanedCount).toBe(10);
      expect(data.deletedCount).toBe(8);
      expect(data.failedDeletions).toHaveLength(2);
    });
  });

  describe('POST /api/workflows/cleanup-orphaned-blobs', () => {
    it('should reject unauthorized requests', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        method: 'POST',
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow requests with valid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-456',
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

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        method: 'POST',
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
    });

    it('should trigger cleanup workflow and return results', async () => {
      const { cleanupOrphanedBlobsWorkflow } = await import('@/lib/workflows/cleanup-orphaned-blobs/index');

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-456',
        },
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(cleanupOrphanedBlobsWorkflow).toHaveBeenCalled();
      expect(data).toMatchObject({
        success: true,
        orphanedCount: 5,
        deletedCount: 5,
      });
    });

    it('should handle workflow errors', async () => {
      const { cleanupOrphanedBlobsWorkflow } = await import('@/lib/workflows/cleanup-orphaned-blobs/index');
      (cleanupOrphanedBlobsWorkflow as any).mockRejectedValueOnce(new Error('Storage access failed'));

      const request = new NextRequest('http://localhost/api/workflows/cleanup-orphaned-blobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-456',
        },
      });

      const response = await postTrigger(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to run orphaned blob cleanup');
      expect(data.details).toBe('Storage access failed');
    });
  });
});
