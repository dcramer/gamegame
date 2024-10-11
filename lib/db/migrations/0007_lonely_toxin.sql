ALTER TABLE "games" RENAME TO "game";--> statement-breakpoint
ALTER TABLE "game" DROP CONSTRAINT "games_name_unique";--> statement-breakpoint
ALTER TABLE "fragment" DROP CONSTRAINT "fragment_game_id_games_id_fk";
--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_game_id_games_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fragment" ADD CONSTRAINT "fragment_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resources" ADD CONSTRAINT "resources_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_name_unique" UNIQUE("name");