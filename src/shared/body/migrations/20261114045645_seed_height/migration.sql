-- A length metric already named Height takes the height role, so no second one is made.
UPDATE `body_metrics` SET `role` = 'height'
WHERE `id` = (SELECT `id` FROM `body_metrics` WHERE `kind` = 'length' AND `role` = '' AND lower(trim(`name`)) = 'height' ORDER BY `position`, `id` LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM `body_metrics` WHERE `role` = 'height');
--> statement-breakpoint
-- Otherwise a Height metric is added, with a fixed id so two devices that upgrade hold the same one.
INSERT INTO `body_metrics` (`id`, `name`, `kind`, `unit`, `position`, `role`)
SELECT 'height', 'Height', 'length', '', coalesce((SELECT max(`position`) + 1 FROM `body_metrics`), 0), 'height'
WHERE NOT EXISTS (SELECT 1 FROM `body_metrics` WHERE `role` = 'height' OR `id` = 'height');
--> statement-breakpoint
-- The height setting becomes the metric's reading, dated at the first weight so BMI covers every weight logged.
INSERT OR IGNORE INTO `body_readings` (`metric_id`, `date`, `value`)
SELECT `metric`.`id`,
	coalesce(
		(SELECT min(`date`) FROM `body_readings` WHERE `metric_id` = (SELECT `id` FROM `body_metrics` WHERE `kind` = 'weight' ORDER BY `position`, `name` LIMIT 1)),
		date('now', 'localtime')
	),
	CAST(`setting`.`value` AS REAL)
FROM `settings` AS `setting`, (SELECT `id` FROM `body_metrics` WHERE `role` = 'height' AND `kind` = 'length' ORDER BY `position`, `name` LIMIT 1) AS `metric`
WHERE `setting`.`key` = 'body.height'
	AND CAST(`setting`.`value` AS REAL) > 0
	AND NOT EXISTS (SELECT 1 FROM `body_readings` WHERE `metric_id` = `metric`.`id`);
