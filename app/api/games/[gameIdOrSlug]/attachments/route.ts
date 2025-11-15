/**
 * Game Attachments API Route
 * GET /api/games/:gameIdOrSlug/attachments - List all attachments for a game
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, resources, attachments } from '@/lib/db/schema';
import { eq, or, asc } from 'drizzle-orm';

/**
 * GET /api/games/:gameIdOrSlug/attachments
 * List all attachments for a game with resource information
 * Requires admin authentication
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ gameIdOrSlug: string }> }
) {
  try {
    // Require admin authentication
    const { requireAdmin } = await import('@/lib/session');
    await requireAdmin();

    const params = await props.params;
    const { gameIdOrSlug } = params;

    // Get game to ensure it exists and get its ID
    const [game] = await db
      .select({ id: games.id })
      .from(games)
      .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
      .limit(1);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Get attachments for this game with resource names
    const attachmentsList = await db
      .select({
        id: attachments.id,
        resourceId: attachments.resourceId,
        resourceName: resources.name,
        type: attachments.type,
        blobKey: attachments.blobKey,
        url: attachments.url,
        mimeType: attachments.mimeType,
        originalFilename: attachments.originalFilename,
        pageNumber: attachments.pageNumber,
        bbox: attachments.bbox,
        caption: attachments.caption,
        width: attachments.width,
        height: attachments.height,
        description: attachments.description,
        isGoodQuality: attachments.isGoodQuality,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .innerJoin(resources, eq(attachments.resourceId, resources.id))
      .where(eq(attachments.gameId, game.id))
      .orderBy(asc(resources.name), asc(attachments.pageNumber), asc(attachments.createdAt));

    // Helper to parse bbox JSON safely
    function parseBbox(bboxValue: any): number[] | undefined {
      if (!bboxValue) return undefined;

      // If it's already an array, return it
      if (Array.isArray(bboxValue)) {
        if (bboxValue.every((v) => typeof v === 'number')) {
          return bboxValue;
        }
        return undefined;
      }

      // If it's a string, try to parse it
      if (typeof bboxValue === 'string') {
        try {
          const parsed = JSON.parse(bboxValue);
          if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) {
            return parsed;
          }
        } catch {
          return undefined;
        }
      }

      return undefined;
    }

    // Get public URLs for attachments
    const { blobKeyToUrl } = await import('@/lib/services/blob-storage');

    // Convert to proper format
    const parsed = attachmentsList.map((attachment) => ({
      ...attachment,
      url: attachment.url ?? (attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : null),
      bbox: parseBbox(attachment.bbox),
      isGoodQuality: attachment.isGoodQuality === 'good' ? true : attachment.isGoodQuality === 'bad' ? false : null,
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[GET /api/games/:gameIdOrSlug/attachments] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attachments' },
      { status: 500 }
    );
  }
}
