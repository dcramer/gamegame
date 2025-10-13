ALTER TABLE "resource" DROP CONSTRAINT "resource_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "resource_game_id_name_unique" ON "resource" USING btree ("game_id","name");