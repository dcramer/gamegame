/**
 * BGG Game Details API Route
 * GET /api/bgg/games/:bggId - Get game details from BoardGameGeek
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBGGGameDetails } from '@/lib/services/bgg';

/**
 * GET /api/bgg/games/:bggId
 * Get game details from BoardGameGeek
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { bggId: string } }
) {
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

    const details = await getBGGGameDetails(bggId, {
      apiKey: process.env.BGG_API_KEY,
    });

    return NextResponse.json(details);
  } catch (error) {
    console.error('[GET /api/bgg/games/:bggId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game from BoardGameGeek' },
      { status: 500 }
    );
  }
}
