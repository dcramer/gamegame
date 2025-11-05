/**
 * BGG Search API Route
 * GET /api/bgg/search?q=query - Search BoardGameGeek for games
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { searchBGGGames } from '@/lib/services/bgg';
import { requireAdmin } from '@/lib/auth/helpers';
import { withRateLimit } from '@/lib/utils/rate-limit-handler';

/**
 * GET /api/bgg/search
 * Search BoardGameGeek for games
 */
export async function GET(request: NextRequest) {
  return withRateLimit(request, 'bgg', async () => {
    try {
      // Require admin authentication
      await requireAdmin();

      const { searchParams } = new URL(request.url);
      const query = searchParams.get('q');

      if (!query || query.length < 2) {
        return NextResponse.json(
          { error: 'Query must be at least 2 characters' },
          { status: 400 }
        );
      }

      // Check if BGG API key is configured
      if (!process.env.BGG_API_KEY) {
        console.warn('BGG_API_KEY not configured, BGG search unavailable');
        return NextResponse.json(
          {
            error: 'BGG_API_KEY_MISSING',
            message: 'BoardGameGeek API key is not configured. Please add games manually or configure BGG_API_KEY.',
            results: []
          },
          { status: 503 }
        );
      }

      // Search BGG (always fetches fresh results from BGG API)
      // Game details/images use cache (check cache before downloading)
      // Thumbnails disabled to avoid blocking (use lazy loading endpoint instead)
      const results = await searchBGGGames(query, {
        fetchThumbnails: false,
        apiKey: process.env.BGG_API_KEY,
      });

      // Check which games are already imported
      const bggIds = results.map((r) => r.id).filter(Boolean);
      const importedGamesMap = new Map<string, { id: string; imageUrl: string | null }>();

      if (bggIds.length > 0) {
        const existingGames = await db
          .select({ id: games.id, bggId: games.bggId, imageUrl: games.imageUrl })
          .from(games)
          .where(inArray(games.bggId, bggIds));

        for (const g of existingGames) {
          if (g.bggId) {
            importedGamesMap.set(g.bggId, { id: g.id, imageUrl: g.imageUrl });
          }
        }
      }

      // Add isImported flag, gameId, and gameImageUrl to results
      const resultsWithStatus = results.map((game) => {
        const importedGame = importedGamesMap.get(game.id);
        return {
          ...game,
          isImported: !!importedGame,
          gameId: importedGame?.id || null,
          gameImageUrl: importedGame?.imageUrl || null,
        };
      });

      return NextResponse.json(resultsWithStatus);
    } catch (error) {
      console.error('[GET /api/bgg/search] Error:', error);
      return NextResponse.json(
        { error: 'Failed to search BoardGameGeek' },
        { status: 500 }
      );
    }
  });
}
