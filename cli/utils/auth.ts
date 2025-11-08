/**
 * CLI Authentication Utilities
 * Generate JWT tokens for CLI operations that require admin access
 */

import { SignJWT } from 'jose';

/**
 * CLI authentication bypass context (legacy)
 * Used to execute server actions without NextAuth session
 */
export interface CLIContext {
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
  bypassAuth: true;
}

export function getCLIContext(): CLIContext {
  return {
    user: {
      id: 'cli',
      email: 'cli@system',
      isAdmin: true,
    },
    bypassAuth: true,
  };
}

/**
 * Generate a JWT token for CLI admin access
 * This bypasses the normal auth flow for internal CLI operations
 */
export async function generateCliToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);

  const token = await new SignJWT({
    userId: 'cli',
    email: 'cli@internal',
    isAdmin: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // Short-lived token for CLI operations
    .sign(secretKey);

  return token;
}

/**
 * Create headers for authenticated CLI requests
 * Uses Bearer token authentication for API calls
 */
export async function getCliHeaders(): Promise<Record<string, string>> {
  const token = await generateCliToken();

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}
