/**
 * Tests for Image Upload API Route
 * POST /api/images/upload - Image upload handler (game box art, etc.)
 *
 * This route has two modes:
 * 1. Development: Accepts formData with file, stores locally/blob
 * 2. Production: Vercel Blob validation endpoint (receives JSON)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { POST as uploadImage } from '@/app/api/images/upload/route';

describe.sequential('Image Upload API', () => {
  beforeEach(async () => {
    // Note: uploaded files are stored in public/uploads/ during tests
  });

  describe('POST /api/images/upload - Development Mode (formData)', () => {
    it('should reject missing file', async () => {
      const formData = new FormData();
      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should upload PNG image', async () => {
      // Create a simple 1x1 transparent PNG
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
      ]);

      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'game-box.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^games\/\d+-[a-zA-Z0-9_-]+\.png$/);
      expect(data.size).toBe(pngData.length);
      expect(data.type).toBe('image/png');
    });

    it('should upload JPEG image', async () => {
      // Create a minimal JPEG (not valid, but type checking is what matters)
      const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const blob = new Blob([jpegData], { type: 'image/jpeg' });
      const file = new File([blob], 'game-box.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^games\/\d+-[a-zA-Z0-9_-]+\.jpg$/);
      expect(data.type).toBe('image/jpeg');
    });

    it('should upload WebP image', async () => {
      // Minimal WebP header
      const webpData = Buffer.from('RIFF....WEBP', 'utf8');
      const blob = new Blob([webpData], { type: 'image/webp' });
      const file = new File([blob], 'game-box.webp', { type: 'image/webp' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^games\/\d+-[a-zA-Z0-9_-]+\.webp$/);
      expect(data.type).toBe('image/webp');
    });

    it('should reject non-image file (PDF)', async () => {
      const pdfData = Buffer.from('%PDF-1.4\n%EOF\n', 'utf8');
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const file = new File([blob], 'document.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('File must be an image');
    });

    it('should reject non-image file (text)', async () => {
      const blob = new Blob(['just some text'], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('File must be an image');
    });

    it('should handle image with no extension in filename', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'gamebox', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should default to 'bin' extension when no extension found
      expect(data.blobKey).toMatch(/^games\/\d+-[a-zA-Z0-9_-]+\.bin$/);
    });

    it('should generate unique blob keys for multiple uploads', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      // Upload first file
      const formData1 = new FormData();
      formData1.append('file', file);
      const request1 = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData1,
      });
      const response1 = await uploadImage(request1);
      const data1 = await response1.json();

      // Upload second file
      const formData2 = new FormData();
      formData2.append('file', file);
      const request2 = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData2,
      });
      const response2 = await uploadImage(request2);
      const data2 = await response2.json();

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(data1.blobKey).not.toBe(data2.blobKey);
    });

    it('should store in games/ directory', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.blobKey).toMatch(/^games\//);
    });
  });

  describe('POST /api/images/upload - Production Mode (Vercel Blob)', () => {
    it('should accept empty payload', async () => {
      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should accept request with clientPayload', async () => {
      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientPayload: {
            gameId: 'game-123',
            name: 'Game Box Art',
          },
        }),
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should accept any JSON body (Vercel Blob validation)', async () => {
      const request = new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          someField: 'someValue',
          anotherField: 123,
        }),
      });

      const response = await uploadImage(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
