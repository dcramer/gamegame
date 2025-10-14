import { sql } from "drizzle-orm";
import {
  text,
  varchar,
  timestamp,
  pgTable,
  integer,
  index,
  uniqueIndex,
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
    name: text("name").notNull(),
    content: text("content"),
    url: text("url").notNull(),

    // this is effectively min(SELECT version FROM fragment WHERE resource_id = resources.id)
    version: integer("version").notNull().default(0),

    // Track which PDF extractor was used to process this resource
    pdfExtractor: varchar("pdf_extractor", { length: 50 }),

    // Denormalized stats for performance
    pageCount: integer("page_count"),
    imageCount: integer("image_count"),
    wordCount: integer("word_count"),

    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    processedAt: timestamp("processed_at"),
  },
  (table) => ({
    gameId: index("idx_resources_game_id").on(table.gameId),
    uniqueGameResource: uniqueIndex("resource_game_id_name_unique").on(table.gameId, table.name),
  })
);

export const insertResourceSchema = createSelectSchema(resources)
  .extend({
    id: z.string().trim().max(191).optional(),
    // Accept both absolute URLs (production) and relative paths (local development)
    url: z.string().trim().refine(
      (val) => {
        // Accept relative paths starting with /
        if (val.startsWith('/')) return true;
        // Accept absolute URLs
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Must be a valid URL or absolute path" }
    ),
    pdfExtractor: z.string().nullable().optional(),
    processedAt: z.date().nullable().optional(),
    pageCount: z.number().nullable().optional(),
    imageCount: z.number().nullable().optional(),
    wordCount: z.number().nullable().optional(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export type NewResourceParams = z.infer<typeof insertResourceSchema>;

export type Resource = typeof resources.$inferSelect;
