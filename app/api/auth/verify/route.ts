/**
 * Magic Link Verification Route
 * Verifies token and creates session
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verificationTokens } from '@/lib/db/schema/auth';
import { users } from '@/lib/db/schema/users';
import { eq, and, gt } from 'drizzle-orm';
import { createSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/auth/error?error=InvalidToken', request.url));
  }

  try {
    // Find and verify the token (token lookup gives us the email)
    const verificationToken = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, token),
          gt(verificationTokens.expires, Date.now())
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!verificationToken) {
      return NextResponse.redirect(new URL('/auth/error?error=TokenExpired', request.url));
    }

    const email = verificationToken.identifier;

    // Delete the token (one-time use)
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, token));

    // Find or create user
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user) {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          name: email.split('@')[0],
          isAdmin: 0,
        })
        .returning();
      user = newUser;
    }

    // Create session
    await createSession(user.id);

    // Redirect to games page
    return NextResponse.redirect(new URL('/games', request.url));
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.redirect(new URL('/auth/error?error=Verification', request.url));
  }
}
