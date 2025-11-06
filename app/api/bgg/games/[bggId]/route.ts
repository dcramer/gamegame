/**
 * BGG Game Details API Route
 * GET /api/bgg/games/:bggId - Get game details from BoardGameGeek
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBGGGameDetails } from '@/lib/services/bgg';
import { withAdmin, errorResponse, withRateLimit } from '@/lib/api/middleware';

/**
 * GET /api/bgg/games/:bggId
 * Get game details from BoardGameGeek (admin only, rate limited)
 */
export const GET = withAdmin(async (
  request: NextRequest,
  user,
  props?: { params: Promise<{ bggId: string }> }
) => {
  return withRateLimit(request, 'bgg', async () => {
    try {
      if (!props) {
        return errorResponse('Invalid request', 400, 'INVALID_REQUEST');
      }

      const params = await props.params;
      const { bggId } = params;

      // Check if BGG API key is configured
      if (!process.env.BGG_API_KEY) {
        return errorResponse(
          'BoardGameGeek API key is not configured',
          503,
          'BGG_API_KEY_MISSING'
        );
      }

      const details = await getBGGGameDetails(bggId, {
        apiKey: process.env.BGG_API_KEY,
      });

      return NextResponse.json(details);
    } catch (error) {
      console.error('[GET /api/bgg/games/:bggId] Error:', error);
      return errorResponse('Failed to fetch game from BoardGameGeek', 500, 'INTERNAL_ERROR');
    }
  });
});
