-- Add r2_key column and migrate from url
-- Step 1: Add r2_key column (nullable first to allow migration)
ALTER TABLE `attachments` ADD COLUMN `r2_key` text;

-- Step 2: Populate r2_key from url
-- Extract R2 key by removing /uploads/ prefix
UPDATE `attachments`
SET `r2_key` = REPLACE(`url`, '/uploads/', '')
WHERE `url` IS NOT NULL;

-- Step 3: Drop the url column
ALTER TABLE `attachments` DROP COLUMN `url`;

-- Note: SQLite doesn't support making columns NOT NULL after creation,
-- so new rows must ensure r2_key is populated
