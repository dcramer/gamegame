import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAdmin } from '@/middleware/auth';

const uploadRouter = new Hono<{ Bindings: Env }>();

/**
 * Image upload endpoint for game box art
 * Accepts image files and uploads to R2 storage
 */
uploadRouter.post('/upload', requireAdmin, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400);
    }

    // Generate unique filename
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `games/uploaded-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to R2
    await c.env.FILES.put(filename, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    if (!c.env.R2_PUBLIC_URL) {
      console.error('R2_PUBLIC_URL is not configured. Rejecting upload.');
      return c.json({ error: 'File storage is not configured' }, 500);
    }

    const baseUrl = c.env.R2_PUBLIC_URL.replace(/\/$/, '');
    const url = `${baseUrl}/${filename}`;

    return c.json({
      url,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      500
    );
  }
});

/**
 * Generic file upload endpoint with type filtering
 * Query param 'type' determines allowed content types:
 * - type=image: Only images
 * - type=pdf: Only PDF files
 * - default: All types allowed
 */
uploadRouter.post('/', requireAdmin, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const type = c.req.query('type');

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type based on query param
    if (type === 'image' && !file.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400);
    }
    if (type === 'pdf' && file.type !== 'application/pdf') {
      return c.json({ error: 'File must be a PDF' }, 400);
    }

    // Generate unique filename
    const extension = file.name.split('.').pop() || 'bin';
    const prefix = type === 'image' ? 'games' : 'uploads';
    const filename = `${prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to R2
    await c.env.FILES.put(filename, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    if (!c.env.R2_PUBLIC_URL) {
      console.error('R2_PUBLIC_URL is not configured. Rejecting upload.');
      return c.json({ error: 'File storage is not configured' }, 500);
    }

    const baseUrl = c.env.R2_PUBLIC_URL.replace(/\/$/, '');
    const url = `${baseUrl}/${filename}`;

    return c.json({
      url,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      500
    );
  }
});

export default uploadRouter;
