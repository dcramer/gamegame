-- Add CHECK constraint for resource status enum
-- Valid statuses: 'ready', 'queued', 'processing', 'completed', 'failed'

-- SQLite doesn't support adding constraints to existing tables,
-- so we need to recreate the table with the constraint

-- Step 1: Create new table with CHECK constraint
CREATE TABLE `resources_new` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `name` text NOT NULL,
  `original_filename` text,
  `author` text,
  `attribution_url` text,
  `url` text NOT NULL,
  `content` text DEFAULT '' NOT NULL,
  `version` integer DEFAULT 0 NOT NULL,
  `pdf_extractor` text,
  `processed_at` integer,
  `status` text DEFAULT 'ready' NOT NULL CHECK(`status` IN ('ready', 'queued', 'processing', 'completed', 'failed')),
  `current_job_id` text,
  `processing_stage` text DEFAULT 'ready' NOT NULL,
  `processing_metadata` text,
  `description` text,
  `page_count` integer,
  `image_count` integer DEFAULT 0,
  `word_count` integer DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Step 2: Copy data from old table
INSERT INTO `resources_new` SELECT * FROM `resources`;

-- Step 3: Drop old table
DROP TABLE `resources`;

-- Step 4: Rename new table
ALTER TABLE `resources_new` RENAME TO `resources`;

-- Step 5: Recreate indexes
CREATE INDEX `idx_resources_game_id` ON `resources` (`game_id`);
CREATE INDEX `idx_resources_status` ON `resources` (`status`);
CREATE INDEX `idx_resources_job_id` ON `resources` (`current_job_id`);
