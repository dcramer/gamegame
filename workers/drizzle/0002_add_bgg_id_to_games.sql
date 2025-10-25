-- Add bgg_id column to games table
ALTER TABLE `games` ADD COLUMN `bgg_id` text;

-- Create unique index on bgg_id
CREATE UNIQUE INDEX `games_bgg_id_unique` ON `games` (`bgg_id`);

-- Create index for efficient lookups
CREATE INDEX `idx_games_bgg_id` ON `games` (`bgg_id`);
