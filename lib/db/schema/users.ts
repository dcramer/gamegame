import { pgTable, varchar, text, integer, bigint, index } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    isAdmin: integer('is_admin').default(0), // 1 = true, 0 = false
    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    emailIdx: index('idx_users_email').on(table.email),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
