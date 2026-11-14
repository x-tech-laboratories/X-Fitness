-- The first weight metric's goal becomes the weight goal, as BMI and the plan read the first weight metric.
INSERT OR IGNORE INTO `body_goals` (`key`, `value`)
SELECT 'weight', `goal` FROM `body_metrics` WHERE `id` = (SELECT `id` FROM `body_metrics` WHERE `kind` = 'weight' ORDER BY `position`, `name` LIMIT 1) AND `goal` > 0;
--> statement-breakpoint
-- The goal of each body fat or girth metric becomes the goal under its role, the first such metric by position winning; other metrics' goals are not kept.
INSERT OR IGNORE INTO `body_goals` (`key`, `value`)
SELECT `role`, `goal` FROM (
	SELECT `role`, `goal`, row_number() OVER (PARTITION BY `role` ORDER BY `position`, `name`, `id`) AS `place`
	FROM `body_metrics`
	WHERE `goal` > 0 AND (
		(`role` = 'body_fat' AND `kind` = 'percent')
		OR (`role` IN ('neck', 'chest', 'underbust', 'waist', 'hips', 'upper_arm', 'wrist', 'thigh', 'knee', 'calf', 'ankle') AND `kind` = 'length')
	)
)
WHERE `place` = 1;
