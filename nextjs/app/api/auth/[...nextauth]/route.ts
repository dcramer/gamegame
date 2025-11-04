/**
 * NextAuth v5 API Route Handler
 * Handles all auth routes: /api/auth/signin, /api/auth/signout, etc.
 */

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
