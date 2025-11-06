/**
 * Tests for Admin Jobs API Routes
 * GET /api/admin/jobs - List all jobs
 * POST /api/admin/jobs/[jobId]/cancel - Cancel a job
 * POST /api/admin/jobs/[jobId]/retry - Retry a failed job
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as listJobs } from '@/app/api/admin/jobs/route';
import { POST as cancelJob } from '@/app/api/admin/jobs/[jobId]/cancel/route';
import { POST as retryJob } from '@/app/api/admin/jobs/[jobId]/retry/route';
import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource, createTestJob } from '@/tests/fixtures';

// Mock the workflow function to prevent actual execution
vi.mock('@/workflows/process-resource/index', () => ({
  processResourceWorkflow: vi.fn(() => Promise.resolve()),
}));

describe.sequential('Admin Jobs API', () => {
  let testGameId: string;
  let testResourceId: string;

  beforeEach(async () => {
    await cleanupTestDb();

    // Create test game and resource
    const game = await createTestGame({ name: 'Test Game' });
    const resource = await createTestResource(game.id, {
      name: 'Test Resource',
      status: 'ready',
    });

    testGameId = game.id;
    testResourceId = resource.id;
  });

  describe('GET /api/admin/jobs', () => {
    it('should return empty array when no jobs exist', async () => {
      const response = await listJobs();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs).toEqual([]);
    });

    it('should return list of jobs with details', async () => {
      // Create a job
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'processing',
        progress: 50,
        currentStep: 'Extracting text',
      });

      const response = await listJobs();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs).toHaveLength(1);
      expect(data.jobs[0]).toMatchObject({
        jobId: job.id,
        type: 'process-resource',
        status: 'processing',
        progress: 50,
        currentStep: 'Extracting text',
        gameId: testGameId,
        gameName: 'Test Game',
        resourceId: testResourceId,
        resourceName: 'Test Resource',
      });
    });

    it('should return jobs ordered by creation date (newest first)', async () => {
      // Create multiple jobs with different timestamps
      const job1 = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        createdAt: Date.now() - 3000,
      });
      const job2 = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        createdAt: Date.now() - 2000,
      });
      const job3 = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        createdAt: Date.now() - 1000,
      });

      const response = await listJobs();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs).toHaveLength(3);
      // Should be ordered newest first
      expect(data.jobs[0].jobId).toBe(job3.id);
      expect(data.jobs[1].jobId).toBe(job2.id);
      expect(data.jobs[2].jobId).toBe(job1.id);
    });

    it('should format error as string when error is object', async () => {
      // Create job with error object
      await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'failed',
        error: {
          message: 'Processing failed',
          code: 'PROCESS_ERROR',
        },
      });

      const response = await listJobs();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs[0].error).toBe('Processing failed');
    });

    it('should handle string error', async () => {
      // Create job with string error
      await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'failed',
        error: 'Simple error message' as any,
      });

      const response = await listJobs();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs[0].error).toBe('Simple error message');
    });

    it('should include jobs with various statuses', async () => {
      await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'pending',
      });
      await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'processing',
      });
      await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'completed',
        completedAt: Date.now(),
      });
      await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'failed',
      });

      const response = await listJobs();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs).toHaveLength(4);
      const statuses = data.jobs.map((j: any) => j.status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('processing');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('failed');
    });
  });

  describe('POST /api/admin/jobs/[jobId]/cancel', () => {
    it('should reject non-existent job', async () => {
      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: 'non-existent-job-id' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Job not found');
    });

    it('should reject cancelling completed job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'completed',
        completedAt: Date.now(),
      });

      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot cancel completed job');
    });

    it('should reject cancelling already cancelled job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'cancelled',
      });

      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Job is already cancelled or failed');
    });

    it('should reject cancelling failed job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'failed',
      });

      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Job is already cancelled or failed');
    });

    it('should successfully cancel pending job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'pending',
      });

      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Job cancelled successfully');

      // Verify job was updated
      const [updatedJob] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, job.id))
        .limit(1);

      expect(updatedJob.status).toBe('cancelled');
      expect(updatedJob.error).toMatchObject({ message: 'Job cancelled by admin' });
      expect(updatedJob.completedAt).toBeGreaterThan(0);
    });

    it('should successfully cancel processing job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'processing',
        progress: 50,
      });

      // Associate resource with this job
      await db
        .update(resources)
        .set({ currentJobId: job.id, status: 'processing' })
        .where(eq(resources.id, testResourceId));

      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify resource was updated
      const [updatedResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(updatedResource.status).toBe('failed');
      expect(updatedResource.currentJobId).toBeNull();
    });

    it('should not update resource if it has different currentJobId', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'processing',
      });

      // Associate resource with a different job
      await db
        .update(resources)
        .set({ currentJobId: 'different-job-id', status: 'processing' })
        .where(eq(resources.id, testResourceId));

      const response = await cancelJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });

      expect(response.status).toBe(200);

      // Verify resource was NOT updated (still has different jobId)
      const [updatedResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(updatedResource.status).toBe('processing');
      expect(updatedResource.currentJobId).toBe('different-job-id');
    });
  });

  describe('POST /api/admin/jobs/[jobId]/retry', () => {
    it('should reject non-existent job', async () => {
      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: 'non-existent-job-id' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Job not found');
    });

    it('should reject retrying completed job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'completed',
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only failed or cancelled jobs can be retried');
    });

    it('should reject retrying pending job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'pending',
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only failed or cancelled jobs can be retried');
    });

    it('should reject retrying processing job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'processing',
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only failed or cancelled jobs can be retried');
    });

    it('should successfully retry failed job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'failed',
        error: { message: 'Previous error' },
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();
      expect(data.jobId).not.toBe(job.id); // Should create new job
      expect(data.message).toBe('Job retrying from beginning');

      // Verify new job was created
      const [newJob] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, data.jobId))
        .limit(1);

      expect(newJob).toBeDefined();
      expect(newJob.status).toBe('pending');
      expect(newJob.progress).toBe(0);
      expect(newJob.currentStep).toBe('Queued for retry');
      expect(newJob.resourceId).toBe(testResourceId);
      expect(newJob.gameId).toBe(testGameId);

      // Verify resource was updated
      const [updatedResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(updatedResource.status).toBe('processing');
      expect(updatedResource.processingStage).toBe('ingest');
      expect(updatedResource.currentJobId).toBe(data.jobId);
    });

    it('should successfully retry cancelled job', async () => {
      const job = await createTestJob({
        gameId: testGameId,
        resourceId: testResourceId,
        status: 'cancelled',
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();
    });

    it('should reject retry when resource not found', async () => {
      // Create job with non-existent resource
      await db.insert(jobs).values({
        id: 'test-job-orphan',
        type: 'process-resource',
        gameId: testGameId,
        resourceId: 'non-existent-resource',
        status: 'failed',
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: 'test-job-orphan' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Resource not found');
    });

    it('should reject retry when game not found', async () => {
      // Create a valid resource, but use a non-existent game ID in the job
      // This simulates the case where the game was deleted after the job was created
      const job = await createTestJob({
        gameId: 'non-existent-game',
        resourceId: testResourceId,
        status: 'failed',
      });

      const response = await retryJob(new Request('http://localhost'), {
        params: Promise.resolve({ jobId: job.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Game not found');
    });
  });
});
