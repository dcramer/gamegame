import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import handler from './cleanup-stalled-jobs';
import type { ResourceJob } from '../lib/jobs/status';
import { cleanupTestDb, createTestGame, createTestResource } from '@/test-utils/setup';
import type { ExecutionContext } from '@cloudflare/workers-types';

describe('cleanup-stalled-jobs', () => {
  beforeEach(async () => {
    await cleanupTestDb();
    // Clear all jobs from KV
    const { keys } = await env.JOB_STATUS_KV.list({ prefix: 'job:' });
    for (const key of keys) {
      await env.JOB_STATUS_KV.delete(key.name);
    }
  });

  afterEach(async () => {
    await cleanupTestDb();
    // Clear all jobs from KV
    const { keys } = await env.JOB_STATUS_KV.list({ prefix: 'job:' });
    for (const key of keys) {
      await env.JOB_STATUS_KV.delete(key.name);
    }
  });

  it('should skip jobs that are not in processing state', async () => {
    // Create completed job
    const completedJob: ResourceJob = {
      jobId: 'job-completed',
      resourceId: 'res-1',
      gameId: 'game-1',
      status: 'completed',
      progress: 100,
      createdAt: Date.now() - 60 * 60 * 1000, // 1 hour ago
      updatedAt: Date.now() - 60 * 60 * 1000,
      completedAt: Date.now() - 60 * 60 * 1000,
    };

    await env.JOB_STATUS_KV.put('job:job-completed', JSON.stringify(completedJob), {
      expirationTtl: 86400,
    });

    const event = {
      scheduledTime: Date.now(),
      cron: '*/10 * * * *',
    } as ScheduledEvent;

    await handler.scheduled!(event, env, {} as ExecutionContext);

    // Job should still be completed (not modified)
    const result = await env.JOB_STATUS_KV.get('job:job-completed', 'json') as ResourceJob;
    expect(result.status).toBe('completed');
  });

  it('should not mark recent processing jobs as stalled', async () => {
    // Create job that has been processing for only 5 minutes
    const recentJob: ResourceJob = {
      jobId: 'job-recent',
      resourceId: 'res-2',
      gameId: 'game-1',
      status: 'processing',
      progress: 50,
      currentStep: 'Embedding content',
      createdAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
      updatedAt: Date.now() - 5 * 60 * 1000, // Last updated 5 minutes ago
    };

    await env.JOB_STATUS_KV.put('job:job-recent', JSON.stringify(recentJob), {
      expirationTtl: 86400,
    });

    const event = {
      scheduledTime: Date.now(),
      cron: '*/10 * * * *',
    } as ScheduledEvent;

    await handler.scheduled!(event, env, {} as ExecutionContext);

    // Job should still be processing (not marked as failed)
    const result = await env.JOB_STATUS_KV.get('job:job-recent', 'json') as ResourceJob;
    expect(result.status).toBe('processing');
    expect(result.error).toBeUndefined();
  });

  it('should mark stalled jobs as failed after 30 minutes', async () => {
    // Create game and resource for the test
    const game = await createTestGame({ id: 'game-1' });
    const resource = await createTestResource(game.id, { id: 'res-3' });

    // Create job that has been processing for 35 minutes
    const stalledJob: ResourceJob = {
      jobId: 'job-stalled',
      resourceId: resource.id,
      gameId: game.id,
      status: 'processing',
      progress: 50,
      currentStep: 'Embedding content',
      createdAt: Date.now() - 35 * 60 * 1000, // 35 minutes ago
      updatedAt: Date.now() - 35 * 60 * 1000, // Last updated 35 minutes ago
    };

    await env.JOB_STATUS_KV.put('job:job-stalled', JSON.stringify(stalledJob), {
      expirationTtl: 86400,
    });

    const event = {
      scheduledTime: Date.now(),
      cron: '*/10 * * * *',
    } as ScheduledEvent;

    await handler.scheduled!(event, env, {} as ExecutionContext);

    // Job should be marked as failed
    const result = await env.JOB_STATUS_KV.get('job:job-stalled', 'json') as ResourceJob;
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Job stalled after');
    expect(result.currentStep).toBe('Processing timed out');
    expect(result.completedAt).toBeDefined();
  });

  it('should handle multiple jobs correctly', async () => {
    const now = Date.now();

    // Create game and resources for the test
    const game = await createTestGame({ id: 'game-1' });
    const resource3 = await createTestResource(game.id, { id: 'res-3' });
    const resource4 = await createTestResource(game.id, { id: 'res-4' });

    // Mix of jobs: completed, recent processing, and stalled
    const jobs: ResourceJob[] = [
      {
        jobId: 'job-completed',
        resourceId: 'res-1',
        gameId: 'game-1',
        status: 'completed',
        progress: 100,
        createdAt: now - 60 * 60 * 1000,
        updatedAt: now - 60 * 60 * 1000,
        completedAt: now - 60 * 60 * 1000,
      },
      {
        jobId: 'job-recent',
        resourceId: 'res-2',
        gameId: 'game-1',
        status: 'processing',
        progress: 50,
        createdAt: now - 5 * 60 * 1000,
        updatedAt: now - 5 * 60 * 1000,
      },
      {
        jobId: 'job-stalled-1',
        resourceId: resource3.id,
        gameId: game.id,
        status: 'processing',
        progress: 30,
        createdAt: now - 45 * 60 * 1000,
        updatedAt: now - 45 * 60 * 1000,
      },
      {
        jobId: 'job-stalled-2',
        resourceId: resource4.id,
        gameId: game.id,
        status: 'processing',
        progress: 75,
        createdAt: now - 60 * 60 * 1000,
        updatedAt: now - 60 * 60 * 1000,
      },
    ];

    for (const job of jobs) {
      await env.JOB_STATUS_KV.put(`job:${job.jobId}`, JSON.stringify(job), {
        expirationTtl: 86400,
      });
    }

    const event = {
      scheduledTime: now,
      cron: '*/10 * * * *',
    } as ScheduledEvent;

    await handler.scheduled!(event, env, {} as ExecutionContext);

    // Check results
    const completedResult = await env.JOB_STATUS_KV.get('job:job-completed', 'json') as ResourceJob;
    expect(completedResult.status).toBe('completed');

    const recentResult = await env.JOB_STATUS_KV.get('job:job-recent', 'json') as ResourceJob;
    expect(recentResult.status).toBe('processing');

    const stalled1Result = await env.JOB_STATUS_KV.get('job:job-stalled-1', 'json') as ResourceJob;
    expect(stalled1Result.status).toBe('failed');

    const stalled2Result = await env.JOB_STATUS_KV.get('job:job-stalled-2', 'json') as ResourceJob;
    expect(stalled2Result.status).toBe('failed');
  });

  it('should handle empty job list', async () => {
    const event = {
      scheduledTime: Date.now(),
      cron: '*/10 * * * *',
    } as ScheduledEvent;

    // Should not throw
    await expect(handler.scheduled!(event, env, {} as ExecutionContext)).resolves.toBeUndefined();
  });
});
