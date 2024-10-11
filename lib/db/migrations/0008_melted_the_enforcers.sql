ALTER TABLE "resources" RENAME TO "resource";--> statement-breakpoint
ALTER TABLE "resource" DROP CONSTRAINT "resources_name_unique";--> statement-breakpoint
ALTER TABLE "fragment" DROP CONSTRAINT "fragment_resource_id_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "resource" DROP CONSTRAINT "resources_game_id_game_id_fk";
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
ALTER TABLE "resource" ADD CONSTRAINT "resource_name_unique" UNIQUE("name");
