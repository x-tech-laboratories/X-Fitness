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
  },
  {
    "name": "20261114055349_seed_skinfolds",
    "statements": [
      "-- A metric for each caliper skinfold, with fixed ids so two devices hold the same ones, unless one already has the role.\nWITH `seed` (`id`, `name`, `comment`, `place`) AS (VALUES\n\t('skinfold_chest', 'Chest Skinfold', 'A diagonal pinch halfway between the armpit and the nipple; a third of the way for women.', 1),\n\t('skinfold_abdomen', 'Belly Skinfold', 'A vertical pinch 2 cm to the right of the navel (abdomen).', 2),\n\t('skinfold_thigh', 'Thigh Skinfold', 'A vertical pinch on the front of the thigh, halfway between the hip and the knee.', 3),\n\t('skinfold_triceps', 'Back of Arm Skinfold', 'A vertical pinch on the back of the upper arm, halfway between the shoulder and the elbow (triceps).', 4),\n\t('skinfold_suprailiac', 'Above Hip Skinfold', 'A diagonal pinch just above the front of the hip bone (suprailiac).', 5),\n\t('skinfold_midaxillary', 'Side of Ribs Skinfold', 'A vertical pinch on the side of the ribs, straight below the armpit at the height of the bottom of the breastbone (midaxillary).', 6),\n\t('skinfold_subscapular', 'Shoulder Blade Skinfold', 'A diagonal pinch just below the bottom corner of the shoulder blade (subscapular).', 7)\n)\nINSERT INTO `body_metrics` (`id`, `name`, `kind`, `unit`, `comment`, `position`, `role`)\nSELECT `seed`.`id`, `seed`.`name`, 'length', '', `seed`.`comment`, coalesce((SELECT max(`position`) FROM `body_metrics`), -1) + `seed`.`place`, `seed`.`id`\nFROM `seed`\nWHERE NOT EXISTS (SELECT 1 FROM `body_metrics` WHERE `role` = `seed`.`id` OR `id` = `seed`.`id`);"
    ]
  },
  {
    "name": "20261114160642_body_goals",
    "statements": [
      "CREATE TABLE `body_goals` (\n\t`key` text PRIMARY KEY,\n\t`value` real NOT NULL\n);"
    ]
  },
  {
    "name": "20261114160644_carry_metric_goals",
    "statements": [
      "-- The first weight metric's goal becomes the weight goal, as BMI and the plan read the first weight metric.\nINSERT OR IGNORE INTO `body_goals` (`key`, `value`)\nSELECT 'weight', `goal` FROM `body_metrics` WHERE `id` = (SELECT `id` FROM `body_metrics` WHERE `kind` = 'weight' ORDER BY `position`, `name` LIMIT 1) AND `goal` > 0;",
      "-- The goal of each body fat or girth metric becomes the goal under its role, the first such metric by position winning; other metrics' goals are not kept.\nINSERT OR IGNORE INTO `body_goals` (`key`, `value`)\nSELECT `role`, `goal` FROM (\n\tSELECT `role`, `goal`, row_number() OVER (PARTITION BY `role` ORDER BY `position`, `name`, `id`) AS `place`\n\tFROM `body_metrics`\n\tWHERE `goal` > 0 AND (\n\t\t(`role` = 'body_fat' AND `kind` = 'percent')\n\t\tOR (`role` IN ('neck', 'chest', 'underbust', 'waist', 'hips', 'upper_arm', 'wrist', 'thigh', 'knee', 'calf', 'ankle') AND `kind` = 'length')\n\t)\n)\nWHERE `place` = 1;"
    ]
  },
  {
    "name": "20261114160724_drop_metric_goal",
    "statements": [
      "-- Sync's update trigger names every column, so it goes before the column does; sync makes it afresh once the migrations are done.\nDROP TRIGGER IF EXISTS `sync_body_metrics_update`;",
      "ALTER TABLE `body_metrics` DROP COLUMN `goal`;"
    ]
  },
  {
    "name": "20261115022454_body_photos",
    "statements": [
      "CREATE TABLE `body_photos` (\n\t`id` text PRIMARY KEY,\n\t`date` text NOT NULL,\n\t`pose` text DEFAULT '' NOT NULL,\n\t`comment` text DEFAULT '' NOT NULL,\n\t`picture` text NOT NULL,\n\t`thumbnail` text DEFAULT '' NOT NULL\n);",
      "CREATE INDEX `body_photos_by_date` ON `body_photos` (`date`);"
    ]
  }
];
