-- The starting resting heart rate metric gives the calculators the resting pulse.
UPDATE `body_metrics` SET `role` = 'resting_heart_rate' WHERE `id` = 'restinghr' AND `role` = '';
