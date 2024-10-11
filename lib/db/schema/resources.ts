import { sql } from "drizzle-orm";
import {
  text,
  varchar,
  timestamp,
  pgTable,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "@/lib/utils";
import { games } from "./games";

export const resources = pgTable(
  "resource",
  {
    id: varchar("id", { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    gameId: varchar("game_id", { length: 191 })
      .references(() => games.id, {
        onDelete: "cascade",
      })
      .notNull(),

    // filename
    name: text("name").notNull().unique(),
    content: text("content"),
    url: text("url").notNull(),

    // this is effectively min(SELECT version FROM fragment WHERE resource_id = resources.id)
    version: integer("version").notNull().default(0),

    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    gameId: index("idx_resources_game_id").on(table.gameId),
  })
);

export const insertResourceSchema = createSelectSchema(resources)
  .extend({
    id: z.string().trim().max(191).optional(),
    url: z.string().trim().url(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export type NewResourceParams = z.infer<typeof insertResourceSchema>;

export type Resource = typeof resources.$inferSelect;
