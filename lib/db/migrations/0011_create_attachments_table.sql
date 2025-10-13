CREATE TABLE "attachment" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"game_id" varchar(191) NOT NULL,
	"resource_id" varchar(191) NOT NULL,
	"type" varchar(50) DEFAULT 'image' NOT NULL,
	"url" text NOT NULL,
	"original_filename" varchar(255),
	"page_number" integer,
	"bbox" jsonb,
	"caption" text,
	"width" integer,
	"height" integer,
	"mime_type" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachments_game_id" ON "attachment" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_resource_id" ON "attachment" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_page_number" ON "attachment" USING btree ("page_number");--> statement-breakpoint
CREATE INDEX "idx_attachments_type" ON "attachment" USING btree ("type");