/**
 * Tests for Process Resource Workflow API Route
 * POST /api/workflows/process-resource - Trigger resource processing workflow
 * GET /api/workflows/process-resource?jobId=xxx - Check job status
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as triggerWorkflow, GET as getJobStatus } from '@/app/api/workflows/process-resource/route';
import { db } from '@/lib/db';
import { resources, jobs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { cleanupTestDb } from '@/tests/db-helpers';

// Mock the workflow function to prevent actual execution
vi.mock('@/lib/workflows/process-resource/index', () => ({
  processResourceWorkflow: vi.fn(() => Promise.resolve()),
}));

describe.sequential('Process Resource Workflow API', () => {
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

  describe('POST /api/workflows/process-resource', () => {
    it('should reject missing resourceId', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject missing gameId', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject missing gameName', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject missing name', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject missing both url and sourceKey', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Either url or sourceKey must be provided');
    });

    it('should reject invalid fromStage parameter', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource?from=invalid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid from parameter');
    });

    it('should reject non-existent resource', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: 'non-existent-id',
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should create job and trigger workflow with url', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();
      expect(data.message).toBe('Resource processing started');

      // Verify job was created
      const [job] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, data.jobId))
        .limit(1);

      expect(job).toBeDefined();
      expect(job.type).toBe('process-resource');
      expect(job.resourceId).toBe(testResourceId);
      expect(job.gameId).toBe(testGameId);
      expect(job.status).toBe('pending');
      expect(job.progress).toBe(0);
      expect(job.currentStep).toBe('Queued for processing');

      // Verify resource was updated
      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(resource.status).toBe('processing');
      expect(resource.processingStage).toBe('ingest');
      expect(resource.currentJobId).toBe(data.jobId);
    });

    it('should create job and trigger workflow with sourceKey', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          sourceKey: 'resources/test-resource.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();

      // Verify job was created
      const [job] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, data.jobId))
        .limit(1);

      expect(job).toBeDefined();
      expect(job.resourceId).toBe(testResourceId);
    });

    it('should accept both url and sourceKey', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
          sourceKey: 'resources/test-resource.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should respect fromStage=vision parameter', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource?from=vision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify resource processingStage was set correctly
      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(resource.processingStage).toBe('vision');
    });

    it('should respect fromStage=cleanup parameter', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource?from=cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(resource.processingStage).toBe('cleanup');
    });

    it('should respect fromStage=metadata parameter', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource?from=metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(resource.processingStage).toBe('metadata');
    });

    it('should respect fromStage=embed parameter', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource?from=embed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceId: testResourceId,
          gameId: testGameId,
          gameName: 'Test Game',
          name: 'Test Resource',
          url: 'https://example.com/test.pdf',
        }),
      });

      const response = await triggerWorkflow(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(resource.processingStage).toBe('embed');
    });
  });

  describe('GET /api/workflows/process-resource', () => {
    it('should reject missing jobId parameter', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource', {
        method: 'GET',
      });

      const response = await getJobStatus(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing jobId parameter');
    });

    it('should reject non-existent job', async () => {
      const request = new Request('http://localhost/api/workflows/process-resource?jobId=non-existent', {
        method: 'GET',
      });

      const response = await getJobStatus(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should return job status for pending job', async () => {
      // Create a job
      const [job] = await db.insert(jobs).values({
        id: 'test-job-id',
        type: 'process-resource',
        resourceId: testResourceId,
        gameId: testGameId,
        status: 'pending',
        progress: 0,
        currentStep: 'Queued for processing',
      }).returning();

      const request = new Request('http://localhost/api/workflows/process-resource?jobId=test-job-id', {
        method: 'GET',
      });

      const response = await getJobStatus(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobId).toBe('test-job-id');
      expect(data.resourceId).toBe(testResourceId);
      expect(data.status).toBe('pending');
      expect(data.progress).toBe(0);
      expect(data.currentStep).toBe('Queued for processing');
      expect(data.error).toBeNull();
      expect(data.createdAt).toBeGreaterThan(0);
      expect(data.completedAt).toBeNull();
    });

    it('should return job status for processing job', async () => {
      await db.insert(jobs).values({
        id: 'test-job-processing',
        type: 'process-resource',
        resourceId: testResourceId,
        gameId: testGameId,
        status: 'processing',
        progress: 50,
        currentStep: 'Extracting text from PDF',
      });

      const request = new Request('http://localhost/api/workflows/process-resource?jobId=test-job-processing', {
        method: 'GET',
      });

      const response = await getJobStatus(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('processing');
      expect(data.progress).toBe(50);
      expect(data.currentStep).toBe('Extracting text from PDF');
    });

    it('should return job status for completed job', async () => {
      const completedAt = Date.now();
      await db.insert(jobs).values({
        id: 'test-job-completed',
        type: 'process-resource',
        resourceId: testResourceId,
        gameId: testGameId,
        status: 'completed',
        progress: 100,
        currentStep: 'Completed',
        completedAt,
      });

      const request = new Request('http://localhost/api/workflows/process-resource?jobId=test-job-completed', {
        method: 'GET',
      });

      const response = await getJobStatus(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('completed');
      expect(data.progress).toBe(100);
      expect(data.completedAt).toBe(completedAt);
    });

    it('should return job status for failed job with error', async () => {
      const completedAt = Date.now();
      await db.insert(jobs).values({
        id: 'test-job-failed',
        type: 'process-resource',
        resourceId: testResourceId,
        gameId: testGameId,
        status: 'failed',
        progress: 30,
        currentStep: 'Failed during ingestion',
        error: {
          message: 'Failed to fetch PDF',
          code: 'FETCH_ERROR',
        },
        completedAt,
      });

      const request = new Request('http://localhost/api/workflows/process-resource?jobId=test-job-failed', {
        method: 'GET',
      });

      const response = await getJobStatus(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.error).toBeDefined();
      expect(data.error.message).toBe('Failed to fetch PDF');
      expect(data.error.code).toBe('FETCH_ERROR');
      expect(data.completedAt).toBe(completedAt);
    });
  });
});
