ALTER TABLE "embeddings" RENAME TO "fragment";--> statement-breakpoint
ALTER TABLE "games" RENAME TO "game";--> statement-breakpoint
ALTER TABLE "resources" RENAME TO "resource";--> statement-breakpoint
ALTER TABLE "game" DROP CONSTRAINT "games_name_unique";--> statement-breakpoint
ALTER TABLE "resource" DROP CONSTRAINT "resources_name_unique";--> statement-breakpoint
ALTER TABLE "fragment" DROP CONSTRAINT "embeddings_game_id_games_id_fk";
--> statement-breakpoint
ALTER TABLE "fragment" DROP CONSTRAINT "embeddings_resource_id_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "resource" DROP CONSTRAINT "resources_game_id_games_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "embeddingIndex";--> statement-breakpoint
ALTER TABLE "fragment" ADD COLUMN "search_vector" tsvector generated always as (to_tsvector('english', content)) stored NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fragment" ADD CONSTRAINT "fragment_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fragment" ADD CONSTRAINT "fragment_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource" ADD CONSTRAINT "resource_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_user_id" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_game_id" ON "fragment" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_resource_id" ON "fragment" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_embedding" ON "fragment" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_embedding_ip" ON "fragment" USING hnsw ("embedding" vector_ip_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fragment_search_vector" ON "fragment" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_resources_game_id" ON "resource" USING btree ("game_id");--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_name_unique" UNIQUE("name");
