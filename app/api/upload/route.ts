/**
 * File Upload API Routes
 * POST /api/upload - Generic file upload (admin only)
 *
 * Supports:
 * - type=image: Image files only (max 10MB)
 * - type=pdf: PDF files only (max 100MB)
 * - default: All types (max 100MB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { uploadBlob } from '@/lib/services/blob-storage';
import { requireAdmin } from '@/lib/auth/helpers';
import { withRateLimit } from '@/lib/utils/rate-limit-handler';

// Maximum file sizes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * POST /api/upload
 * Generic file upload endpoint with type filtering
 */
export async function POST(request: NextRequest) {
  return withRateLimit(request, 'upload', async () => {
    try {
      // Require admin authentication
      await requireAdmin();

      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const url = new URL(request.url);
      const type = url.searchParams.get('type');

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file type based on query param
      if (type === 'image' && !file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'File must be an image' },
          { status: 400 }
        );
      }
      if (type === 'pdf' && file.type !== 'application/pdf') {
        return NextResponse.json(
          { error: 'File must be a PDF' },
          { status: 400 }
        );
      }

      // Validate file size
      const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_PDF_SIZE;
      if (file.size > maxSize) {
        return NextResponse.json(
          { error: `File must be less than ${maxSize / 1024 / 1024}MB` },
          { status: 400 }
        );
      }

      // Generate unique filename with safe extension extraction
      const nameParts = file.name ? file.name.split('.') : [];
      const extension = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'bin';
      const prefix = type === 'image' ? 'games' : 'uploads';
      const blobKey = `${prefix}/${Date.now()}-${nanoid()}.${extension}`;

      // Read file data
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to storage (Vercel Blob or local)
      const url_result = await uploadBlob(blobKey, buffer, file.type);

      return NextResponse.json({
        url: url_result,
        blobKey,
        size: file.size,
        type: file.type,
      });
    } catch (error) {
      console.error('[POST /api/upload] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Upload failed' },
        { status: 500 }
      );
    }
  });
}
