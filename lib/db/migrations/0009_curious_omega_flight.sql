DROP INDEX IF EXISTS "idx_embeddings_game_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_embeddings_resource_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_embeddings_embedding";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_game_id" ON "fragment" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_resource_id" ON "fragment" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_embedding" ON "fragment" USING hnsw ("embedding" vector_cosine_ops);