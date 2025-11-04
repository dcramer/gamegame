/**
 * BGG Game Import API Route
 * POST /api/bgg/games/:bggId/import - Import game from BoardGameGeek
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getBGGGameDetails, downloadImage } from '@/lib/services/bgg';
import { nanoid } from 'nanoid';

function generateSlug(name: string, year?: number | null): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return year ? `${slug}-${year}` : slug;
}

/**
 * POST /api/bgg/games/:bggId/import
 * Import a game from BoardGameGeek (fetches data, downloads image, creates game)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { bggId: string } }
) {
  let uploadedImageKey: string | null = null;

  try {
    // TODO: Add admin authentication check
    // const session = await getServerSession();
    // if (!session?.user?.isAdmin) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const { bggId } = params;

    // Check if BGG API key is configured
    if (!process.env.BGG_API_KEY) {
      return NextResponse.json(
        {
          error: 'BGG_API_KEY_MISSING',
          message: 'BoardGameGeek API key is not configured.'
        },
        { status: 503 }
      );
    }

    // Fetch game details from BGG
    const details = await getBGGGameDetails(
      bggId,
      db,
      null,
      { apiKey: process.env.BGG_API_KEY }
    );

    // Download and upload image if available
    let imageUrl: string | null = null;
    if (details.imageUrl) {
      try {
        const { uploadBlob } = await import('@/lib/services/blob-storage');
        const imageBuffer = await downloadImage(details.imageUrl);

        // Detect image type from buffer
        let extension = 'jpg';
        let contentType = 'image/jpeg';

        // Check magic bytes to determine actual format
        if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
          extension = 'png';
          contentType = 'image/png';
        } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
          extension = 'gif';
          contentType = 'image/gif';
        } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
          extension = 'webp';
          contentType = 'image/webp';
        }

        // Upload to blob storage
        uploadedImageKey = `games/game-${bggId}.${extension}`;
        await uploadBlob(uploadedImageKey, imageBuffer, contentType);

        // Get the public URL
        const { getPublicUrl } = await import('@/lib/services/blob-storage');
        imageUrl = getPublicUrl(uploadedImageKey);
      } catch (imageError) {
        console.error('[POST /api/bgg/games/:bggId/import] Image processing failed:', imageError);
        // Continue without image - user can upload manually
      }
    }

    // Create the game with BGG data
    const year = details.yearPublished || null;
    const slug = generateSlug(details.name, year);
    const gameId = nanoid();

    await db.insert(games).values({
      id: gameId,
      name: details.name,
      year,
      slug,
      imageUrl,
      bggId,
      bggUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
    });

    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    // Clean up uploaded image if game creation failed
    if (uploadedImageKey) {
      try {
        const { deleteBlob } = await import('@/lib/services/blob-storage');
        await deleteBlob(uploadedImageKey);
      } catch (cleanupError) {
        console.error('[POST /api/bgg/games/:bggId/import] Failed to cleanup image after error:', cleanupError);
      }
    }

    console.error('[POST /api/bgg/games/:bggId/import] Error:', error);

    // Check if it's a duplicate error (PostgreSQL unique constraint violation)
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const errorCause = (error as any).cause;

      // Check for PostgreSQL unique constraint errors
      const isUniqueConstraintError =
        errorMessage.includes('unique constraint') ||
        errorMessage.includes('duplicate key') ||
        (errorCause && (
          errorCause.code === '23505' ||
          errorCause.constraint_name?.includes('unique')
        ));

      if (isUniqueConstraintError) {
        if (errorMessage.includes('slug') || errorCause?.constraint_name?.includes('slug')) {
          return NextResponse.json(
            { error: 'A game with this name and year already exists' },
            { status: 409 }
          );
        }
        if (errorMessage.includes('bgg_id') || errorCause?.constraint_name?.includes('bgg_id')) {
          return NextResponse.json(
            { error: 'This game has already been imported' },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: 'This game has already been imported' },
          { status: 409 }
        );
      }
    }

    // Return more specific error message if available
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message || 'Failed to create game from BoardGameGeek' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create game from BoardGameGeek' },
      { status: 500 }
    );
  }
}
