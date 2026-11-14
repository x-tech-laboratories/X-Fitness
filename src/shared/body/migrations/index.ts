// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261110211428_start",
    "statements": [
      "CREATE TABLE `body_days` (\n\t`date` text PRIMARY KEY,\n\t`comment` text NOT NULL\n);",
      "CREATE TABLE `body_metrics` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`unit` text DEFAULT '' NOT NULL,\n\t`goal` real DEFAULT 0 NOT NULL,\n\t`comment` text DEFAULT '' NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL\n);",
      "CREATE TABLE `body_readings` (\n\t`metric_id` text NOT NULL,\n\t`date` text NOT NULL,\n\t`value` real NOT NULL,\n\tCONSTRAINT `body_readings_pk` PRIMARY KEY(`metric_id`, `date`),\n\tCONSTRAINT `fk_body_readings_metric_id_body_metrics_id_fk` FOREIGN KEY (`metric_id`) REFERENCES `body_metrics`(`id`) ON DELETE CASCADE\n);",
      "CREATE INDEX `body_readings_by_date` ON `body_readings` (`date`);"
    ]
  },
  {
    "name": "20261110211429_seed_metrics",
    "statements": [
      "-- The add-on's starting metrics, with fixed ids so two devices that start fresh hold the same ones.\nINSERT INTO `body_metrics` (`id`, `name`, `kind`, `unit`, `position`) VALUES\n\t('weight', 'Weight', 'weight', '', 0),\n\t('bodyfat', 'Body Fat', 'percent', '', 1),\n\t('waist', 'Waist', 'length', '', 2),\n\t('chest', 'Chest', 'length', '', 3),\n\t('hips', 'Hips', 'length', '', 4),\n\t('arm', 'Arm', 'length', '', 5),\n\t('thigh', 'Thigh', 'length', '', 6),\n\t('neck', 'Neck', 'length', '', 7),\n\t('restinghr', 'Resting Heart Rate', 'custom', 'bpm', 8);"
    ]
  },
  {
    "name": "20261110220848_metric_role",
    "statements": [
      "ALTER TABLE `body_metrics` ADD `role` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261110220849_seed_metric_roles",
    "statements": [
      "-- The starting metrics shape the 3D body as their names say.\nUPDATE `body_metrics` SET `role` = CASE `id`\n\tWHEN 'bodyfat' THEN 'body_fat'\n\tWHEN 'waist' THEN 'waist'\n\tWHEN 'chest' THEN 'chest'\n\tWHEN 'hips' THEN 'hips'\n\tWHEN 'arm' THEN 'upper_arm'\n\tWHEN 'thigh' THEN 'thigh'\n\tWHEN 'neck' THEN 'neck'\nEND\nWHERE `role` = '' AND `id` IN ('bodyfat', 'waist', 'chest', 'hips', 'arm', 'thigh', 'neck');"
    ]
  },
  {
    "name": "20261114015323_seed_resting_heart_rate",
    "statements": [
      "-- The starting resting heart rate metric gives the calculators the resting pulse.\nUPDATE `body_metrics` SET `role` = 'resting_heart_rate' WHERE `id` = 'restinghr' AND `role` = '';"
    ]
  },
  {
    "name": "20261114045645_seed_height",
    "statements": [
      "-- A length metric already named Height takes the height role, so no second one is made.\nUPDATE `body_metrics` SET `role` = 'height'\nWHERE `id` = (SELECT `id` FROM `body_metrics` WHERE `kind` = 'length' AND `role` = '' AND lower(trim(`name`)) = 'height' ORDER BY `position`, `id` LIMIT 1)\n\tAND NOT EXISTS (SELECT 1 FROM `body_metrics` WHERE `role` = 'height');",
      "-- Otherwise a Height metric is added, with a fixed id so two devices that upgrade hold the same one.\nINSERT INTO `body_metrics` (`id`, `name`, `kind`, `unit`, `position`, `role`)\nSELECT 'height', 'Height', 'length', '', coalesce((SELECT max(`position`) + 1 FROM `body_metrics`), 0), 'height'\nWHERE NOT EXISTS (SELECT 1 FROM `body_metrics` WHERE `role` = 'height' OR `id` = 'height');",
      "-- The height setting becomes the metric's reading, dated at the first weight so BMI covers every weight logged.\nINSERT OR IGNORE INTO `body_readings` (`metric_id`, `date`, `value`)\nSELECT `metric`.`id`,\n\tcoalesce(\n\t\t(SELECT min(`date`) FROM `body_readings` WHERE `metric_id` = (SELECT `id` FROM `body_metrics` WHERE `kind` = 'weight' ORDER BY `position`, `name` LIMIT 1)),\n\t\tdate('now', 'localtime')\n\t),\n\tCAST(`setting`.`value` AS REAL)\nFROM `settings` AS `setting`, (SELECT `id` FROM `body_metrics` WHERE `role` = 'height' AND `kind` = 'length' ORDER BY `position`, `name` LIMIT 1) AS `metric`\nWHERE `setting`.`key` = 'body.height'\n\tAND CAST(`setting`.`value` AS REAL) > 0\n\tAND NOT EXISTS (SELECT 1 FROM `body_readings` WHERE `metric_id` = `metric`.`id`);"
    ]
  }
];
