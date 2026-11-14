CREATE TABLE `__new_workout_categories` (
	`id` text PRIMARY KEY,
	`parent_id` text,
	`name` text DEFAULT '' NOT NULL,
	`position` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
WITH RECURSIVE named(path) AS (
  SELECT `name` FROM `workout_categories`
  UNION SELECT value FROM `exercises`, json_each(`exercises`.`categories`) WHERE json_valid(`exercises`.`categories`) AND type = 'text'
  UNION SELECT value FROM `program_sessions`, json_each(`program_sessions`.`categories`) WHERE json_valid(`program_sessions`.`categories`) AND type = 'text'
), every_path(path) AS (
  SELECT path FROM named WHERE path <> ''
  UNION SELECT substr(path, 1, length(rtrim(path, replace(path, '/', ''))) - 1) FROM every_path WHERE instr(path, '/') > 0
)
INSERT INTO `__new_workout_categories` (`id`) SELECT path FROM every_path;
--> statement-breakpoint
UPDATE `__new_workout_categories` SET
  `parent_id` = CASE WHEN instr(`id`, '/') > 0 THEN substr(`id`, 1, length(rtrim(`id`, replace(`id`, '/', ''))) - 1) END,
  `name` = substr(`id`, length(rtrim(`id`, replace(`id`, '/', ''))) + 1);
--> statement-breakpoint
UPDATE `__new_workout_categories` SET `position` = (
  SELECT count(*) FROM `__new_workout_categories` AS `other`
  WHERE `other`.`parent_id` IS `__new_workout_categories`.`parent_id` AND `other`.`name` COLLATE NOCASE < `__new_workout_categories`.`name` COLLATE NOCASE
);
--> statement-breakpoint
DROP TABLE `workout_categories`;
--> statement-breakpoint
ALTER TABLE `__new_workout_categories` RENAME TO `workout_categories`;
