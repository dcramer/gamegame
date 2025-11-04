/**
 * NextAuth v5 adapter tables for Drizzle
 * Based on: https://authjs.dev/getting-started/adapters/drizzle
 */

import { pgTable, varchar, text, integer, bigint, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';

export const accounts = pgTable(
  'accounts',
  {
    userId: varchar('user_id', { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 191 }).notNull(),
    provider: varchar('provider', { length: 191 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 191 }).notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: varchar('token_type', { length: 191 }),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => ({
    compoundKey: primaryKey({
      columns: [table.provider, table.providerAccountId],
    }),
  })
);

export const sessions = pgTable('sessions', {
  sessionToken: varchar('session_token', { length: 191 }).notNull().primaryKey(),
  userId: varchar('user_id', { length: 191 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: bigint('expires', { mode: 'number' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: varchar('identifier', { length: 191 }).notNull(),
    token: varchar('token', { length: 191 }).notNull(),
    expires: bigint('expires', { mode: 'number' }).notNull(),
  },
  (table) => ({
    compoundKey: primaryKey({
      columns: [table.identifier, table.token],
    }),
  })
);

export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;
