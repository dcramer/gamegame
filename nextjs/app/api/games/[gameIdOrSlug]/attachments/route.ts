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
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameIdOrSlug: string } }
) {
  try {
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
    function parseBbox(bboxValue: string | null | undefined): number[] | undefined {
      if (!bboxValue) return undefined;
      try {
        const parsed = JSON.parse(typeof bboxValue === 'string' ? bboxValue : String(bboxValue));
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) {
          return parsed;
        }
        return undefined;
      } catch {
        return undefined;
      }
    }

    // Convert to proper format
    const parsed = attachmentsList.map((attachment) => ({
      ...attachment,
      bbox: parseBbox(attachment.bbox),
      isGoodQuality: attachment.isGoodQuality === 1 ? true : attachment.isGoodQuality === 0 ? false : null,
      createdAt: attachment.createdAt ? attachment.createdAt.toISOString() : new Date().toISOString(),
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
