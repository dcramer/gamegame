import { nanoid } from "@/lib/utils";
import {
  index,
  integer,
  pgTable,
  text,
  unique,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { games } from "./games";
import { resources } from "./resources";

export const embeddings = pgTable(
  "embeddings",
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
    index: integer("index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  },
  (table) => ({
    embeddingIndex: index("embeddingIndex").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    chunkIndex: unique("chunkIndex").on(table.resourceId, table.index),
  })
);

// export const insertEmbeddingSchema = createSelectSchema(embeddings)
//   .extend({})
//   .omit({
//     id: true,
//   });

// export type NewEmbeddingParams = z.infer<typeof insertEmbeddingSchema>;
