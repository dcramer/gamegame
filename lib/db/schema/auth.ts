/**
 * Auth tables
 * Only verification tokens for magic link auth
 */

import { pgTable, varchar, bigint, primaryKey } from 'drizzle-orm/pg-core';

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

export type VerificationToken = typeof verificationTokens.$inferSelect;
