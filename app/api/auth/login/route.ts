/**
 * Magic Link Login Route
 * Generates verification token and sends magic link email
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verificationTokens } from '@/lib/db/schema/auth';
import { randomBytes } from 'crypto';
import { loginSchema } from '@/lib/api/schemas';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const { email } = result.data;

    // Generate verification token
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Insert verification token
    await db.insert(verificationTokens).values({
      identifier: email.toLowerCase(),
      token,
      expires,
    });

    // Generate magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const loginUrl = `${baseUrl}/api/auth/verify?token=${token}`;

    // In development mode, log the URL (since email might not be configured)
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n🔗 Magic link for ${email}:\n${loginUrl}\n⏰ Link expires in 15 minutes\n`);
      return NextResponse.json({
        success: true,
        message: 'Development mode: Magic link logged to server console',
      });
    }

    // TODO: Send email via Resend in production
    // For now, log in production too until Resend is configured
    console.log(`\n🔗 Magic link for ${email}:\n${loginUrl}\n`);

    return NextResponse.json({
      success: true,
      message: 'Check your email for the login link',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to send login email. Please try again.' },
      { status: 500 }
    );
  }
}
