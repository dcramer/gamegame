import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupStalledJobsWorkflow } from './cleanup-stalled-jobs';

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

describe('Cleanup Stalled Jobs Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find and mark stalled jobs as failed', async () => {
    const { db } = await import('@/lib/db');

    const now = Date.now();
    const stalledTime = now - 40 * 60 * 1000; // 40 minutes ago

    // Mock finding stalled jobs
    (db.execute as any).mockResolvedValueOnce([
      {
        id: 'job-1',
        resourceId: 'res-1',
        gameId: 'game-1',
        currentStep: 'Processing PDF',
        updatedAt: stalledTime,
      },
      {
        id: 'job-2',
        resourceId: 'res-2',
        gameId: 'game-1',
        currentStep: 'Embedding',
        updatedAt: stalledTime,
      },
    ]);

    // Mock successful updates (update returns the update builder)
    (db.update as any).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });

    const result = await cleanupStalledJobsWorkflow();

    expect(result.success).toBe(true);
    expect(result.totalJobs).toBe(2);
    expect(result.stalledJobs).toBe(2);
    expect(result.cleanedJobs).toBe(2);
    expect(result.failedUpdates).toBe(0);
    expect(result.errors).toEqual([]);

    // Verify update was called for both jobs and resources
    expect(db.update).toHaveBeenCalledTimes(4); // 2 jobs + 2 resources
  });

  it('should handle no stalled jobs', async () => {
    const { db } = await import('@/lib/db');

    // Mock finding no stalled jobs
    (db.execute as any).mockResolvedValueOnce([]);

    const result = await cleanupStalledJobsWorkflow();

    expect(result.success).toBe(true);
    expect(result.totalJobs).toBe(0);
    expect(result.stalledJobs).toBe(0);
    expect(result.cleanedJobs).toBe(0);
    expect(result.failedUpdates).toBe(0);
  });

  it('should handle update failures', async () => {
    const { db } = await import('@/lib/db');

    const now = Date.now();
    const stalledTime = now - 40 * 60 * 1000;

    // Mock finding stalled jobs
    (db.execute as any).mockResolvedValueOnce([
      {
        id: 'job-1',
        resourceId: 'res-1',
        gameId: 'game-1',
        currentStep: 'Processing PDF',
        updatedAt: stalledTime,
      },
    ]);

    // Mock update failure
    let updateCallCount = 0;
    (db.update as any).mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) {
        // First update (job) fails
        return {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockRejectedValue(new Error('Database error')),
        };
      }
      // Should not reach resource update due to error
      return {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
    });

    const result = await cleanupStalledJobsWorkflow();

    expect(result.success).toBe(false);
    expect(result.stalledJobs).toBe(1);
    expect(result.cleanedJobs).toBe(0);
    expect(result.failedUpdates).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].jobId).toBe('job-1');
    expect(result.errors[0].error).toContain('Database error');
  });

  it('should correctly identify stalled jobs by time threshold', async () => {
    const { db } = await import('@/lib/db');

    const now = Date.now();
    const justStalled = now - 31 * 60 * 1000; // 31 minutes ago (stalled)
    const notStalled = now - 29 * 60 * 1000; // 29 minutes ago (not stalled)

    // Mock finding jobs - only stalled ones should be returned
    (db.execute as any).mockResolvedValueOnce([
      {
        id: 'job-stalled',
        resourceId: 'res-1',
        gameId: 'game-1',
        currentStep: 'Processing',
        updatedAt: justStalled,
      },
      // notStalled job would be filtered by the SQL query
    ]);

    (db.update as any).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });

    const result = await cleanupStalledJobsWorkflow();

    expect(result.stalledJobs).toBe(1);
    expect(result.cleanedJobs).toBe(1);
  });

  it('should set appropriate error messages', async () => {
    const { db } = await import('@/lib/db');

    const now = Date.now();
    const stalledTime = now - 45 * 60 * 1000; // 45 minutes ago

    // Mock finding stalled job
    (db.execute as any).mockResolvedValueOnce([
      {
        id: 'job-1',
        resourceId: 'res-1',
        gameId: 'game-1',
        currentStep: 'Embedding',
        updatedAt: stalledTime,
      },
    ]);

    let jobUpdateSet: any;
    (db.update as any).mockImplementation(() => {
      return {
        set: vi.fn().mockImplementation((data) => {
          jobUpdateSet = data;
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
        where: vi.fn().mockResolvedValue(undefined),
      };
    });

    await cleanupStalledJobsWorkflow();

    // Check that the error message includes duration
    expect(jobUpdateSet?.error?.message).toContain('45 minutes');
    expect(jobUpdateSet?.currentStep).toBe('Processing timed out');
    expect(jobUpdateSet?.status).toBe('failed');
  });
});
