/**
 * Tests for Upload API Route
 * POST /api/upload - File upload (images, PDFs)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { POST as uploadFile } from '@/app/api/upload/route';

describe.sequential('Upload API', () => {
  beforeEach(async () => {
    // Note: uploaded files are stored in public/uploads/ during tests
    // and should be cleaned up if needed
  });

  describe('POST /api/upload', () => {
    it('should reject missing file', async () => {
      const formData = new FormData();
      const request = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should upload image file', async () => {
      // Create a simple PNG image (1x1 pixel transparent PNG)
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
      ]);

      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload?type=image', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^games\/\d+-[a-zA-Z0-9_-]+\.png$/);
      expect(data.size).toBe(pngData.length);
      expect(data.type).toBe('image/png');
    });

    it('should reject non-image when type=image', async () => {
      const blob = new Blob(['not an image'], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload?type=image', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('File must be an image');
    });

    it('should reject large image files', async () => {
      // Create a blob larger than 10MB
      const largeData = Buffer.alloc(11 * 1024 * 1024);
      const blob = new Blob([largeData], { type: 'image/png' });
      const file = new File([blob], 'large.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload?type=image', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('10MB');
    });

    it('should upload PDF file', async () => {
      // Create a minimal PDF
      const pdfData = Buffer.from('%PDF-1.4\n%EOF\n', 'utf8');
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const file = new File([blob], 'test.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload?type=pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^uploads\/\d+-[a-zA-Z0-9_-]+\.pdf$/);
      expect(data.type).toBe('application/pdf');
    });

    it('should reject non-PDF when type=pdf', async () => {
      const blob = new Blob(['not a pdf'], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload?type=pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('File must be a PDF');
    });

    it('should upload any file type when type not specified', async () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('blobKey');
      expect(data.blobKey).toMatch(/^uploads\/\d+-[a-zA-Z0-9_-]+\.txt$/);
    });

    it('should handle file with no extension', async () => {
      const blob = new Blob(['test'], { type: 'application/octet-stream' });
      const file = new File([blob], 'noext', { type: 'application/octet-stream' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await uploadFile(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.blobKey).toMatch(/^uploads\/\d+-[a-zA-Z0-9_-]+\.bin$/);
    });
  });
});
