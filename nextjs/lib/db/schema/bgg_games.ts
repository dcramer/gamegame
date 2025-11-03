import { pgTable, varchar, integer, text, bigint, index, jsonb } from 'drizzle-orm/pg-core';

/**
 * BGG Games cache table - stores BoardGameGeek game data to avoid repeated API calls
 */
export const bggGames = pgTable(
  'bgg_games',
  {
    id: varchar('id', { length: 191 }).primaryKey(), // BGG ID
    name: text('name').notNull(),
    yearPublished: integer('year_published'),
    minPlayers: integer('min_players'),
    maxPlayers: integer('max_players'),
    playingTime: integer('playing_time'),
    thumbnailUrl: text('thumbnail_url'),
    imageUrl: text('image_url'),
    description: text('description'),
    publishers: jsonb('publishers').$type<string[]>(),
    designers: jsonb('designers').$type<string[]>(),
    categories: jsonb('categories').$type<string[]>(),
    mechanics: jsonb('mechanics').$type<string[]>(),
    cachedAt: bigint('cached_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    nameIdx: index('idx_bgg_games_name').on(table.name),
  })
);

export type BggGame = typeof bggGames.$inferSelect;
export type NewBggGame = typeof bggGames.$inferInsert;
