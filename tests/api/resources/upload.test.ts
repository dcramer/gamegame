/**
 * Tests for Resource Upload API Route
 * POST /api/resources/upload - PDF upload handler
 *
 * This route has two modes:
 * 1. Development: Accepts formData with file, stores locally/blob
 * 2. Production: Vercel Blob validation endpoint (receives JSON with clientPayload)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { POST as uploadResource } from '@/app/api/resources/upload/route';
import { createNextRequest } from '@/tests/utils/next-request';

describe.sequential('Resource Upload API', () => {
  beforeEach(async () => {
    // Note: uploaded files are stored in public/uploads/ during tests
  });

  describe('POST /api/resources/upload - Development Mode (formData)', () => {
    it('should reject missing file', async () => {
      const formData = new FormData();
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should upload PDF file', async () => {
      // Create a minimal valid PDF
      const pdfData = Buffer.from('%PDF-1.4\n%EOF\n', 'utf8');
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const file = new File([blob], 'test-rulebook.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^resources\/\d+-[a-zA-Z0-9_-]+\.pdf$/);
      expect(data.size).toBe(pdfData.length);
      expect(data.type).toBe('application/pdf');
    });

    it('should reject non-PDF file', async () => {
      const blob = new Blob(['not a pdf'], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('File must be a PDF');
    });

    it('should reject image file', async () => {
      // Create a simple PNG
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('File must be a PDF');
    });

    it('should handle PDF with no extension in filename', async () => {
      const pdfData = Buffer.from('%PDF-1.4\n%EOF\n', 'utf8');
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const file = new File([blob], 'rulebook', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.blobKey).toMatch(/^resources\/\d+-[a-zA-Z0-9_-]+\.pdf$/);
    });

    it('should generate unique blob keys for multiple uploads', async () => {
      const pdfData = Buffer.from('%PDF-1.4\n%EOF\n', 'utf8');
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const file = new File([blob], 'test.pdf', { type: 'application/pdf' });

      // Upload first file
      const formData1 = new FormData();
      formData1.append('file', file);
      const request1 = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData1,
      });
      const response1 = await uploadResource(request1);
      const data1 = await response1.json();

      // Upload second file
      const formData2 = new FormData();
      formData2.append('file', file);
      const request2 = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        body: formData2,
      });
      const response2 = await uploadResource(request2);
      const data2 = await response2.json();

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(data1.blobKey).not.toBe(data2.blobKey);
    });
  });

  describe('POST /api/resources/upload - Production Mode (Vercel Blob)', () => {
    it('should accept valid clientPayload', async () => {
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientPayload: {
            gameId: 'game-123',
            resourceId: 'resource-456',
            name: 'Rulebook',
          },
        }),
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should accept clientPayload as JSON string', async () => {
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientPayload: JSON.stringify({
            gameId: 'game-123',
            resourceId: 'resource-456',
            name: 'Rulebook',
          }),
        }),
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject missing gameId in payload', async () => {
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientPayload: {
            resourceId: 'resource-456',
            name: 'Rulebook',
          },
        }),
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields in payload');
    });

    it('should reject missing resourceId in payload', async () => {
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientPayload: {
            gameId: 'game-123',
            name: 'Rulebook',
          },
        }),
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields in payload');
    });

    it('should reject missing name in payload', async () => {
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientPayload: {
            gameId: 'game-123',
            resourceId: 'resource-456',
          },
        }),
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields in payload');
    });

    it('should accept empty payload (no clientPayload)', async () => {
      const request = createNextRequest('http://localhost/api/resources/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await uploadResource(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
