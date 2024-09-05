import { sql } from "drizzle-orm";
import { text, varchar, timestamp, pgTable } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "@/lib/utils";
import { games } from "./games";

export const resources = pgTable("resources", {
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
  url: text("url").notNull(),

  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
});

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
