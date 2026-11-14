// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261110214633_start",
    "statements": [
      "CREATE TABLE `exercises` (\n\t`id` text PRIMARY KEY,\n\t`name` text DEFAULT '' NOT NULL,\n\t`measurement` text DEFAULT 'weight' NOT NULL,\n\t`equipment` text DEFAULT '' NOT NULL,\n\t`muscles` text DEFAULT '[]' NOT NULL,\n\t`categories` text DEFAULT '[]' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL\n);",
      "CREATE TABLE `program_sessions` (\n\t`id` text PRIMARY KEY,\n\t`program_id` text NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`name` text DEFAULT '' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`categories` text DEFAULT '[]' NOT NULL,\n\tCONSTRAINT `fk_program_sessions_program_id_programs_id_fk` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `programs` (\n\t`id` text PRIMARY KEY,\n\t`name` text DEFAULT '' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL\n);",
      "CREATE TABLE `session_exercises` (\n\t`id` text PRIMARY KEY,\n\t`session_id` text NOT NULL,\n\t`exercise_id` text DEFAULT '' NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`sets` real DEFAULT 3 NOT NULL,\n\t`reps` real DEFAULT 0 NOT NULL,\n\t`weight_kg` real DEFAULT 0 NOT NULL,\n\t`duration_s` real DEFAULT 0 NOT NULL,\n\t`distance_km` real DEFAULT 0 NOT NULL,\n\t`rest_s` real DEFAULT 0 NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`progression_type` text DEFAULT 'none' NOT NULL,\n\t`increment` real DEFAULT 0 NOT NULL,\n\t`increment_percent` integer DEFAULT 0 NOT NULL,\n\t`successes` real DEFAULT 1 NOT NULL,\n\t`success_counter` real DEFAULT 0 NOT NULL,\n\t`decrement` real DEFAULT 0 NOT NULL,\n\t`decrement_percent` integer DEFAULT 0 NOT NULL,\n\t`failures` real DEFAULT 1 NOT NULL,\n\t`failure_counter` real DEFAULT 0 NOT NULL,\n\t`min_reps` real DEFAULT 0 NOT NULL,\n\t`max_reps` real DEFAULT 0 NOT NULL,\n\t`reps_threshold` real DEFAULT 0 NOT NULL,\n\tCONSTRAINT `fk_session_exercises_session_id_program_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `program_sessions`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `workout_categories` (\n\t`name` text PRIMARY KEY\n);",
      "CREATE TABLE `workout_exercises` (\n\t`id` text PRIMARY KEY,\n\t`workout_id` text NOT NULL,\n\t`exercise_id` text DEFAULT '' NOT NULL,\n\t`session_entry_id` text DEFAULT '' NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`target_sets` real DEFAULT 0 NOT NULL,\n\t`target_reps` real DEFAULT 0 NOT NULL,\n\t`target_weight_kg` real DEFAULT 0 NOT NULL,\n\t`target_duration_s` real DEFAULT 0 NOT NULL,\n\t`target_distance_km` real DEFAULT 0 NOT NULL,\n\t`target_rest_s` real DEFAULT 0 NOT NULL,\n\tCONSTRAINT `fk_workout_exercises_workout_id_workouts_id_fk` FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `workout_sets` (\n\t`id` text PRIMARY KEY,\n\t`workout_exercise_id` text NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`reps` real DEFAULT 0 NOT NULL,\n\t`weight_kg` real DEFAULT 0 NOT NULL,\n\t`duration_s` real DEFAULT 0 NOT NULL,\n\t`distance_km` real DEFAULT 0 NOT NULL,\n\t`rpe` real DEFAULT 0 NOT NULL,\n\tCONSTRAINT `fk_workout_sets_workout_exercise_id_workout_exercises_id_fk` FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `workouts` (\n\t`id` text PRIMARY KEY,\n\t`date` text NOT NULL,\n\t`name` text DEFAULT 'Workout' NOT NULL,\n\t`session_id` text DEFAULT '' NOT NULL,\n\t`started_at` text DEFAULT '' NOT NULL,\n\t`finished_at` text DEFAULT '' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL\n);",
      "CREATE INDEX `program_sessions_by_program` ON `program_sessions` (`program_id`);",
      "CREATE INDEX `session_exercises_by_session` ON `session_exercises` (`session_id`);",
      "CREATE INDEX `workout_exercises_by_workout` ON `workout_exercises` (`workout_id`);",
      "CREATE INDEX `workout_sets_by_entry` ON `workout_sets` (`workout_exercise_id`);",
      "CREATE INDEX `workouts_by_date` ON `workouts` (`date`);"
    ]
  },
  {
    "name": "20261114021118_category_tree",
    "statements": [
      "CREATE TABLE `__new_workout_categories` (\n\t`id` text PRIMARY KEY,\n\t`parent_id` text,\n\t`name` text DEFAULT '' NOT NULL,\n\t`position` real DEFAULT 0 NOT NULL\n);",
      "WITH RECURSIVE named(path) AS (\n  SELECT `name` FROM `workout_categories`\n  UNION SELECT value FROM `exercises`, json_each(`exercises`.`categories`) WHERE json_valid(`exercises`.`categories`) AND type = 'text'\n  UNION SELECT value FROM `program_sessions`, json_each(`program_sessions`.`categories`) WHERE json_valid(`program_sessions`.`categories`) AND type = 'text'\n), every_path(path) AS (\n  SELECT path FROM named WHERE path <> ''\n  UNION SELECT substr(path, 1, length(rtrim(path, replace(path, '/', ''))) - 1) FROM every_path WHERE instr(path, '/') > 0\n)\nINSERT INTO `__new_workout_categories` (`id`) SELECT path FROM every_path;",
      "UPDATE `__new_workout_categories` SET\n  `parent_id` = CASE WHEN instr(`id`, '/') > 0 THEN substr(`id`, 1, length(rtrim(`id`, replace(`id`, '/', ''))) - 1) END,\n  `name` = substr(`id`, length(rtrim(`id`, replace(`id`, '/', ''))) + 1);",
      "UPDATE `__new_workout_categories` SET `position` = (\n  SELECT count(*) FROM `__new_workout_categories` AS `other`\n  WHERE `other`.`parent_id` IS `__new_workout_categories`.`parent_id` AND `other`.`name` COLLATE NOCASE < `__new_workout_categories`.`name` COLLATE NOCASE\n);",
      "DROP TABLE `workout_categories`;",
      "ALTER TABLE `__new_workout_categories` RENAME TO `workout_categories`;"
    ]
  }
];
