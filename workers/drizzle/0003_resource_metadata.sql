ALTER TABLE `resources` ADD COLUMN `original_filename` text NOT NULL DEFAULT '';
UPDATE `resources` SET `original_filename` = COALESCE(NULLIF(`original_filename`, ''), `name`, 'Uploaded Rulebook');
ALTER TABLE `resources` ADD COLUMN `description` text;
