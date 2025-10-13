import {
  text,
  varchar,
  pgTable,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * BGG Games Cache
 * Stores game metadata from BoardGameGeek to avoid repeated API calls
 */
export const bggGames = pgTable(
  "bgg_game",
  {
    bggId: varchar("bgg_id", { length: 50 }).primaryKey(),
    name: text("name").notNull(),
    yearPublished: integer("year_published"),
    type: varchar("type", { length: 50 }).notNull(), // boardgame, boardgameexpansion
    thumbnailUrl: text("thumbnail_url"),
    imageUrl: text("image_url"),
    description: text("description"),
    minPlayers: integer("min_players"),
    maxPlayers: integer("max_players"),
    playingTime: integer("playing_time"),
    publishers: text("publishers").array(), // Array of publisher names
    designers: text("designers").array(), // Array of designer names

    cachedAt: timestamp("cached_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    nameIdx: index("bgg_game_name_idx").on(table.name),
    cachedAtIdx: index("bgg_game_cached_at_idx").on(table.cachedAt),
  })
);

export type BGGGame = typeof bggGames.$inferSelect;
export type NewBGGGame = typeof bggGames.$inferInsert;
