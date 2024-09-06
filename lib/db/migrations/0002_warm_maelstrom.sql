ALTER TABLE "resources" DROP CONSTRAINT "resources_game_id_games_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resources" ADD CONSTRAINT "resources_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_name_unique" UNIQUE("name");