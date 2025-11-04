/**
 * Tests for Individual Resource API Routes
 * GET /api/resources/:resourceId - Get resource
 * PATCH /api/resources/:resourceId - Update resource
 * DELETE /api/resources/:resourceId - Delete resource
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getResource, PATCH as updateResource, DELETE as deleteResource } from '@/app/api/resources/[resourceId]/route';
import { db } from '@/lib/db';
import { games, resources, fragments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe.sequential('Resource Detail API', () => {
  let testGameId: string;
  let testResourceId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(games).where(eq(games.slug, 'test-game-resource'));
    await db.delete(resources).where(eq(resources.name, 'Test Resource Detail'));

    // Create test game
    testGameId = nanoid();
    await db.insert(games).values({
      id: testGameId,
      name: 'Test Game',
      slug: 'test-game-resource',
      year: null,
      imageUrl: null,
      bggId: null,
      bggUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create test resource
    testResourceId = nanoid();
    await db.insert(resources).values({
      id: testResourceId,
      gameId: testGameId,
      name: 'Test Resource Detail',
      description: null,
      url: 'https://example.com/test.pdf',
      originalFilename: null,
      status: 'ready',
      processingStage: 'ready',
      currentJobId: null,
      processingMetadata: null,
      content: 'Test content',
      version: 1,
      pdfExtractor: 'mistral',
      processedAt: Date.now(),
      pageCount: 5,
      imageCount: 2,
      wordCount: 100,
      resourceType: 'rulebook',
      edition: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  describe('GET /api/resources/:resourceId', () => {
    it('should get resource with fragment count', async () => {
      const request = new Request(`http://localhost/api/resources/${testResourceId}`);
      const response = await getResource(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        id: testResourceId,
        gameId: testGameId,
        name: 'Test Resource Detail',
        status: 'ready',
        fragmentCount: 0,
      });
    });

    it('should return 404 for non-existent resource', async () => {
      const request = new Request('http://localhost/api/resources/non-existent');
      const response = await getResource(request, { params: { resourceId: 'non-existent' } });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/resources/:resourceId', () => {
    it('should update resource name', async () => {
      const request = new Request(`http://localhost/api/resources/${testResourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Resource',
        }),
      });

      const response = await updateResource(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Updated Resource');
    });

    it('should update resource description', async () => {
      const request = new Request(`http://localhost/api/resources/${testResourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'New description',
        }),
      });

      const response = await updateResource(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.description).toBe('New description');
    });

    it('should return 404 for non-existent resource', async () => {
      const request = new Request('http://localhost/api/resources/non-existent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await updateResource(request, { params: { resourceId: 'non-existent' } });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/resources/:resourceId', () => {
    it('should delete resource without fragments', async () => {
      const request = new Request(`http://localhost/api/resources/${testResourceId}`, {
        method: 'DELETE',
      });

      const response = await deleteResource(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        deletedFragments: 0,
        deletedAttachments: 0,
      });

      // Verify resource is deleted
      const [deletedResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, testResourceId))
        .limit(1);

      expect(deletedResource).toBeUndefined();
    });

    it('should delete resource with fragments', async () => {
      // Create fragment
      const fragmentId = nanoid();
      await db.insert(fragments).values({
        id: fragmentId,
        gameId: testGameId,
        resourceId: testResourceId,
        type: 'text',
        attachmentId: null,
        content: 'Test fragment',
        searchableContent: 'Test fragment',
        syntheticQuestions: null,
        resourceName: 'Test Resource Detail',
        resourceDescription: null,
        resourceType: 'rulebook',
        version: 1,
        pageNumber: 1,
        pageRangeStart: null,
        pageRangeEnd: null,
        section: null,
        images: null,
      });

      const request = new Request(`http://localhost/api/resources/${testResourceId}`, {
        method: 'DELETE',
      });

      const response = await deleteResource(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        deletedFragments: 1,
      });

      // Verify cascade deletion
      const [deletedFragment] = await db
        .select()
        .from(fragments)
        .where(eq(fragments.id, fragmentId))
        .limit(1);

      expect(deletedFragment).toBeUndefined();
    });

    it('should return 404 for non-existent resource', async () => {
      const request = new Request('http://localhost/api/resources/non-existent', {
        method: 'DELETE',
      });

      const response = await deleteResource(request, { params: { resourceId: 'non-existent' } });

      expect(response.status).toBe(404);
    });
  });
});
