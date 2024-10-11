ALTER TABLE "embeddings" RENAME TO "fragment";--> statement-breakpoint
ALTER TABLE "fragment" DROP CONSTRAINT "embeddings_game_id_games_id_fk";
--> statement-breakpoint
ALTER TABLE "fragment" DROP CONSTRAINT "embeddings_resource_id_resources_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "embeddingIndex";--> statement-breakpoint
DROP INDEX IF EXISTS "searchVectorIndex";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fragment" ADD CONSTRAINT "fragment_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fragment" ADD CONSTRAINT "fragment_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_user_id" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_game_id" ON "fragment" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_resource_id" ON "fragment" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_embedding" ON "fragment" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_search_vector" ON "fragment" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_resources_game_id" ON "resources" USING btree ("game_id");