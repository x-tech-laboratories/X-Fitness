-- The add-on's starting metrics, with fixed ids so two devices that start fresh hold the same ones.
INSERT INTO `body_metrics` (`id`, `name`, `kind`, `unit`, `position`) VALUES
	('weight', 'Weight', 'weight', '', 0),
	('bodyfat', 'Body Fat', 'percent', '', 1),
	('waist', 'Waist', 'length', '', 2),
	('chest', 'Chest', 'length', '', 3),
	('hips', 'Hips', 'length', '', 4),
	('arm', 'Arm', 'length', '', 5),
	('thigh', 'Thigh', 'length', '', 6),
	('neck', 'Neck', 'length', '', 7),
	('restinghr', 'Resting Heart Rate', 'custom', 'bpm', 8);
