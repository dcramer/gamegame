import { nanoid } from "@/lib/utils";
import {
  index,
  integer,
  pgTable,
  text,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { games } from "./games";
import { resources } from "./resources";
import { tsvector } from "../columns/tsvector";

/**
 * Fragments are portions of a document. Ideally they are at minimum a paragraph, and at
 * maximum a full page covering a concept.
 */
export const fragments = pgTable(
  "fragment",
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
    content: text("content").notNull(),

    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    searchVector: tsvector("search_vector", {
      sources: ["content"],
    }).notNull(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    gameId: index("idx_fragment_game_id").on(table.gameId),
    resourceId: index("idx_fragment_resource_id").on(table.resourceId),
    embedding: index("idx_fragment_embedding").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    searchVector: index("idx_fragment_search_vector").using(
      "gin",
      table.searchVector
    ),
  })
);

// export const insertEmbeddingSchema = createSelectSchema(embeddings)
//   .extend({})
//   .omit({
//     id: true,
//   });

// export type NewEmbeddingParams = z.infer<typeof insertEmbeddingSchema>;
