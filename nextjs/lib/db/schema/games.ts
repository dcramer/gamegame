import { pgTable, varchar, integer, text, timestamp, index, bigint } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const games = pgTable(
  'games',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    year: integer('year'),
    slug: varchar('slug', { length: 191 }).notNull().unique(),
    imageUrl: text('image_url'),
    bggId: varchar('bgg_id', { length: 191 }).unique(),
    bggUrl: text('bgg_url'),
    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    nameIdx: index('idx_games_name').on(table.name),
    bggIdIdx: index('idx_games_bgg_id').on(table.bggId),
  })
);

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
