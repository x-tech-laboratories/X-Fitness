-- A metric for each caliper skinfold, with fixed ids so two devices hold the same ones, unless one already has the role.
WITH `seed` (`id`, `name`, `comment`, `place`) AS (VALUES
	('skinfold_chest', 'Chest Skinfold', 'A diagonal pinch halfway between the armpit and the nipple; a third of the way for women.', 1),
	('skinfold_abdomen', 'Belly Skinfold', 'A vertical pinch 2 cm to the right of the navel (abdomen).', 2),
	('skinfold_thigh', 'Thigh Skinfold', 'A vertical pinch on the front of the thigh, halfway between the hip and the knee.', 3),
	('skinfold_triceps', 'Back of Arm Skinfold', 'A vertical pinch on the back of the upper arm, halfway between the shoulder and the elbow (triceps).', 4),
	('skinfold_suprailiac', 'Above Hip Skinfold', 'A diagonal pinch just above the front of the hip bone (suprailiac).', 5),
	('skinfold_midaxillary', 'Side of Ribs Skinfold', 'A vertical pinch on the side of the ribs, straight below the armpit at the height of the bottom of the breastbone (midaxillary).', 6),
	('skinfold_subscapular', 'Shoulder Blade Skinfold', 'A diagonal pinch just below the bottom corner of the shoulder blade (subscapular).', 7)
)
INSERT INTO `body_metrics` (`id`, `name`, `kind`, `unit`, `comment`, `position`, `role`)
SELECT `seed`.`id`, `seed`.`name`, 'length', '', `seed`.`comment`, coalesce((SELECT max(`position`) FROM `body_metrics`), -1) + `seed`.`place`, `seed`.`id`
FROM `seed`
WHERE NOT EXISTS (SELECT 1 FROM `body_metrics` WHERE `role` = `seed`.`id` OR `id` = `seed`.`id`);
