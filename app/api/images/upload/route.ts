/**
 * Image Upload Handler
 * POST /api/images/upload
 *
 * In development: Accepts formData with file and saves locally
 * In production: Vercel Blob client upload validation endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { nanoid } from 'nanoid';
import { uploadBlob } from '@/lib/services/blob-storage';

/**
 * POST /api/images/upload
 * Handles image file uploads (game box art, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    // In development, lib/uploads/client.ts sends formData
    // In production, Vercel Blob sends JSON with clientPayload
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Development mode: Handle formData upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'File must be an image' },
          { status: 400 }
        );
      }

      // Generate unique filename
      const nameParts = file.name ? file.name.split('.') : [];
      const extension = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'bin';
      const blobKey = `games/${Date.now()}-${nanoid()}.${extension}`;

      // Read file data
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to storage (local or Vercel Blob)
      const url = await uploadBlob(blobKey, buffer, file.type);

      return NextResponse.json({
        url,
        blobKey,
        size: file.size,
        type: file.type,
      });
    } else {
      // Production mode: Vercel Blob validation
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('[POST /api/images/upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload validation failed' },
      { status: 500 }
    );
  }
}
