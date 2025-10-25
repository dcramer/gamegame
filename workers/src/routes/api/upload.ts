import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env } from '@/types';
import { requireAdmin } from '@/middleware/auth';

const uploadRouter = new Hono<{ Bindings: Env }>();

// Maximum file sizes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB

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

    // Validate file size
    if (file.size > MAX_IMAGE_SIZE) {
      return c.json({ error: `Image must be less than ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }, 400);
    }

    // Generate unique filename with safe extension extraction
    const nameParts = file.name ? file.name.split('.') : [];
    const extension = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'jpg';
    const filename = `games/uploaded-${Date.now()}-${nanoid()}.${extension}`;

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to R2
    await c.env.FILES.put(filename, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    const url = `/uploads/${filename}`;

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
 * - type=image: Only images (max 10MB)
 * - type=pdf: Only PDF files (max 100MB)
 * - default: All types allowed (max 100MB)
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

    // Validate file size
    const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_PDF_SIZE;
    if (file.size > maxSize) {
      return c.json({ error: `File must be less than ${maxSize / 1024 / 1024}MB` }, 400);
    }

    // Generate unique filename with safe extension extraction
    const nameParts = file.name ? file.name.split('.') : [];
    const extension = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'bin';
    const prefix = type === 'image' ? 'games' : 'uploads';
    const filename = `${prefix}/${Date.now()}-${nanoid()}.${extension}`;

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to R2
    await c.env.FILES.put(filename, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    const url = `/uploads/${filename}`;

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
