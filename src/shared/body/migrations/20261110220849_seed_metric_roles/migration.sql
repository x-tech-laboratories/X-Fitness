-- The starting metrics shape the 3D body as their names say.
UPDATE `body_metrics` SET `role` = CASE `id`
	WHEN 'bodyfat' THEN 'body_fat'
	WHEN 'waist' THEN 'waist'
	WHEN 'chest' THEN 'chest'
	WHEN 'hips' THEN 'hips'
	WHEN 'arm' THEN 'upper_arm'
	WHEN 'thigh' THEN 'thigh'
	WHEN 'neck' THEN 'neck'
END
WHERE `role` = '' AND `id` IN ('bodyfat', 'waist', 'chest', 'hips', 'arm', 'thigh', 'neck');
