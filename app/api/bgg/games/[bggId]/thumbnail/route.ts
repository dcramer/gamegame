/**
 * BGG Thumbnail Lazy-Loading API Route
 * GET /api/bgg/games/[bggId]/thumbnail - Fetch and cache thumbnail URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bggGames } from '@/lib/db/schema/bgg_games';
import { eq } from 'drizzle-orm';
import { getBGGGameDetails } from '@/lib/services/bgg';
import { requireAdmin } from '@/lib/auth/helpers';
import { withRateLimit } from '@/lib/utils/rate-limit-handler';

/**
 * GET /api/bgg/games/:bggId/thumbnail
 * Fetch thumbnail URL from cache or BGG API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { bggId: string } }
) {
  return withRateLimit(request, 'bgg', async () => {
    try {
      // Require admin authentication
      await requireAdmin();

      const { bggId } = params;

      if (!bggId) {
        return NextResponse.json(
          { error: 'BGG ID is required' },
          { status: 400 }
        );
      }

      // Check cache first (instant if available)
      const cachedGame = await db
        .select({ thumbnailUrl: bggGames.thumbnailUrl })
        .from(bggGames)
        .where(eq(bggGames.id, bggId))
        .limit(1);

      if (cachedGame.length > 0 && cachedGame[0].thumbnailUrl) {
        console.log(`Thumbnail for BGG ID ${bggId} found in cache`);
        return NextResponse.json({
          thumbnailUrl: cachedGame[0].thumbnailUrl,
          cached: true
        });
      }

      // Not in cache - fetch from BGG API (rate-limited)
      console.log(`Thumbnail for BGG ID ${bggId} not cached, fetching from API`);

      if (!process.env.BGG_API_KEY) {
        console.warn('BGG_API_KEY not configured');
        return NextResponse.json(
          {
            error: 'BGG_API_KEY_MISSING',
            message: 'BoardGameGeek API key is not configured'
          },
          { status: 503 }
        );
      }

      const details = await getBGGGameDetails(bggId, {
        apiKey: process.env.BGG_API_KEY,
      });

      // Cache will be automatically populated by getBGGGameDetails
      return NextResponse.json({
        thumbnailUrl: details.thumbnailUrl || null,
        cached: false
      });
    } catch (error) {
      console.error(`[GET /api/bgg/games/${params.bggId}/thumbnail] Error:`, error);

      if (error instanceof Error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch thumbnail' },
        { status: 500 }
      );
    }
  });
}
