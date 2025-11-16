/**
 * Token Refresh Route
 * Issues a new JWT with fresh expiration
 */

import { NextResponse } from 'next/server';
import { refreshSession } from '@/lib/session';

export async function POST() {
  try {
    const success = await refreshSession();

    if (!success) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 }
    );
  }
}
