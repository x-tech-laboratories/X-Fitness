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
  }
];
