/**
 * BGG Extract ID API Route
 * GET /api/bgg/extract-id?url=... - Extract BGG ID from URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBGGId } from '@/lib/services/bgg';
import { requireAdmin } from '@/lib/auth/helpers';

/**
 * GET /api/bgg/extract-id
 * Extract BoardGameGeek ID from a URL
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    const bggId = extractBGGId(url);

    if (!bggId) {
      return NextResponse.json(
        { error: 'Invalid BGG URL' },
        { status: 400 }
      );
    }

    return NextResponse.json({ bggId });
  } catch (error) {
    console.error('[GET /api/bgg/extract-id] Error:', error);
    return NextResponse.json(
      { error: 'Failed to extract BGG ID' },
      { status: 500 }
    );
  }
}
