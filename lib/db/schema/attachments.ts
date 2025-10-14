import { sql } from "drizzle-orm";
import {
  text,
  varchar,
  timestamp,
  pgTable,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { nanoid } from "@/lib/utils";
import { resources } from "./resources";
import { games } from "./games";

export const attachments = pgTable(
  "attachment",
  {
    id: varchar("id", { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),

    gameId: varchar("game_id", { length: 191 })
      .references(() => games.id, {
        onDelete: "cascade",
      })
      .notNull(),

    resourceId: varchar("resource_id", { length: 191 })
      .references(() => resources.id, {
        onDelete: "cascade",
      })
      .notNull(),

    // Type of attachment (image, video, audio, etc.)
    type: varchar("type", { length: 50 }).notNull().default("image"),

    // URL where the attachment is stored (Vercel Blob or local)
    url: text("url").notNull(),

    // Original filename from source (e.g., "img-0.jpeg" from Mistral)
    originalFilename: varchar("original_filename", { length: 255 }),

    // Page number where this attachment appears (for PDFs)
    pageNumber: integer("page_number"),

    // Bounding box coordinates [x1, y1, x2, y2] from OCR (for images)
    bbox: jsonb("bbox").$type<number[]>(),

    // Optional caption/alt text
    caption: text("caption"),

    // Media dimensions (if available)
    width: integer("width"),
    height: integer("height"),

    // MIME type
    mimeType: varchar("mime_type", { length: 100 }),

    // AI-generated description of the image content
    description: text("description"),

    // Quality assessment: null = not analyzed, true = good quality, false = bad quality (poor crop, etc.)
    isGoodQuality: varchar("is_good_quality", { length: 10 }).$type<"good" | "bad" | null>(),

    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    gameId: index("idx_attachments_game_id").on(table.gameId),
    resourceId: index("idx_attachments_resource_id").on(table.resourceId),
    pageNumber: index("idx_attachments_page_number").on(table.pageNumber),
    type: index("idx_attachments_type").on(table.type),
  })
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
