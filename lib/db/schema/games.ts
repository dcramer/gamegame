import { text, varchar, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "@/lib/utils";
import { sql } from "drizzle-orm";

export const games = pgTable("games", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),

  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const insertGameSchema = createSelectSchema(games).extend({}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NewGameParams = z.infer<typeof insertGameSchema>;
