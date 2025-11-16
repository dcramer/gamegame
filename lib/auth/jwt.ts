/**
 * JWT utilities for authentication
 * Uses SESSION_SECRET as signing key for compatibility
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '@/lib/env.mjs';

/**
 * JWT payload structure
 */
export interface JWTTokenPayload extends JWTPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

// Convert SESSION_SECRET to Uint8Array for jose library
const SECRET_KEY = new TextEncoder().encode(env.SESSION_SECRET);

// Token expiration: 30 days (matching current session lifetime)
const TOKEN_EXPIRATION = '30d';

/**
 * Sign a JWT token with user data
 */
export async function signJWT(payload: {
  userId: string;
  email: string;
  isAdmin: boolean;
}): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    isAdmin: payload.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRATION)
    .sign(SECRET_KEY);
}

/**
 * Verify and decode a JWT token
 * Returns null if token is invalid or expired
 */
export async function verifyJWT(
  token: string,
): Promise<JWTTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ['HS256'],
    });

    return payload as JWTTokenPayload;
  } catch (error) {
    // Token invalid or expired
    return null;
  }
}

/**
 * Refresh a JWT token (issue new token with same claims but fresh expiration)
 * Returns null if the original token is invalid
 */
export async function refreshJWT(token: string): Promise<string | null> {
  const payload = await verifyJWT(token);
  if (!payload) return null;

  return signJWT({
    userId: payload.userId,
    email: payload.email,
    isAdmin: payload.isAdmin,
  });
}
