import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb, createTestGame, createTestResource, createTestAttachment } from '@/test-utils/setup';

describe('Attachments Endpoint Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/attachments/:attachmentId', () => {
    it('should return attachment by id', async () => {
      const game = await createTestGame();
      const resource = await createTestResource(game.id);
      const attachment = await createTestAttachment(resource.id, game.id, {
        bbox: JSON.stringify([10, 20, 100, 200]),
      });

      const response = await SELF.fetch(`http://localhost/api/attachments/${attachment.id}`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        id: attachment.id,
        resourceId: resource.id,
        type: 'image',
        mimeType: 'image/png',
        pageNumber: 1,
      });
      expect(data.bbox).toEqual([10, 20, 100, 200]);
    });

    it('should return 404 for non-existent attachment', async () => {
      const response = await SELF.fetch('http://localhost/api/attachments/nonexistent');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Attachment not found');
    });
  });

  describe('GET /api/attachments/resources/:resourceId', () => {
    it('should return all attachments for a resource', async () => {
      const game = await createTestGame();
      const resource = await createTestResource(game.id);
      await createTestAttachment(resource.id, game.id, { pageNumber: 1 });
      await createTestAttachment(resource.id, game.id, { pageNumber: 2 });

      const response = await SELF.fetch(`http://localhost/api/attachments/resources/${resource.id}`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0].resourceId).toBe(resource.id);
      expect(data[1].resourceId).toBe(resource.id);
    });

    it('should order attachments by page number', async () => {
      const game = await createTestGame();
      const resource = await createTestResource(game.id);
      await createTestAttachment(resource.id, game.id, { pageNumber: 5 });
      await createTestAttachment(resource.id, game.id, { pageNumber: 2 });
      await createTestAttachment(resource.id, game.id, { pageNumber: 8 });

      const response = await SELF.fetch(`http://localhost/api/attachments/resources/${resource.id}`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(3);
      expect(data[0].pageNumber).toBe(2);
      expect(data[1].pageNumber).toBe(5);
      expect(data[2].pageNumber).toBe(8);
    });

    it('should return empty array for resource with no attachments', async () => {
      const game = await createTestGame();
      const resource = await createTestResource(game.id);

      const response = await SELF.fetch(`http://localhost/api/attachments/resources/${resource.id}`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });
  });
});
