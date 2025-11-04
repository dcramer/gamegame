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

  return user || null;
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
      emailVerified: null,
      image: null,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
    });

  return user;
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

  return user;
}
