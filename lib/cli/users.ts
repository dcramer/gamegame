/**
 * Shared user utilities for CLI
 */

import { db } from '../db';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface User {
  id: string;
  email: string;
  name: string | null;
  isAdmin: number;
}

function normalizeUser<T extends { isAdmin: number | null }>(user: T): Omit<T, 'isAdmin'> & { isAdmin: number } {
  return {
    ...user,
    isAdmin: user.isAdmin ?? 0,
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ? normalizeUser(user) : null;
}

export async function createUserForCLI(input: {
  email: string;
  name?: string;
  isAdmin?: boolean;
}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      id: nanoid(),
      email: input.email.toLowerCase(),
      name: input.name || null,
      isAdmin: input.isAdmin ? 1 : 0,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
    });

  return normalizeUser(user);
}

export async function grantAdminForCLI(email: string): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ isAdmin: 1 })
    .where(eq(users.email, email.toLowerCase()))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
    });

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  return normalizeUser(user);
}
