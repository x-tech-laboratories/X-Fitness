CREATE TABLE `exercises` (
	`id` text PRIMARY KEY,
	`name` text DEFAULT '' NOT NULL,
	`measurement` text DEFAULT 'weight' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`muscles` text DEFAULT '[]' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `program_sessions` (
	`id` text PRIMARY KEY,
	`program_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	CONSTRAINT `fk_program_sessions_program_id_programs_id_fk` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY,
	`name` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`exercise_id` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`sets` real DEFAULT 3 NOT NULL,
	`reps` real DEFAULT 0 NOT NULL,
	`weight_kg` real DEFAULT 0 NOT NULL,
	`duration_s` real DEFAULT 0 NOT NULL,
	`distance_km` real DEFAULT 0 NOT NULL,
	`rest_s` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`progression_type` text DEFAULT 'none' NOT NULL,
	`increment` real DEFAULT 0 NOT NULL,
	`increment_percent` integer DEFAULT 0 NOT NULL,
	`successes` real DEFAULT 1 NOT NULL,
	`success_counter` real DEFAULT 0 NOT NULL,
	`decrement` real DEFAULT 0 NOT NULL,
	`decrement_percent` integer DEFAULT 0 NOT NULL,
	`failures` real DEFAULT 1 NOT NULL,
	`failure_counter` real DEFAULT 0 NOT NULL,
	`min_reps` real DEFAULT 0 NOT NULL,
	`max_reps` real DEFAULT 0 NOT NULL,
	`reps_threshold` real DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_session_exercises_session_id_program_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `program_sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workout_categories` (
	`name` text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY,
	`workout_id` text NOT NULL,
	`exercise_id` text DEFAULT '' NOT NULL,
	`session_entry_id` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`target_sets` real DEFAULT 0 NOT NULL,
	`target_reps` real DEFAULT 0 NOT NULL,
	`target_weight_kg` real DEFAULT 0 NOT NULL,
	`target_duration_s` real DEFAULT 0 NOT NULL,
	`target_distance_km` real DEFAULT 0 NOT NULL,
	`target_rest_s` real DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_workout_exercises_workout_id_workouts_id_fk` FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY,
	`workout_exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`reps` real DEFAULT 0 NOT NULL,
	`weight_kg` real DEFAULT 0 NOT NULL,
	`duration_s` real DEFAULT 0 NOT NULL,
	`distance_km` real DEFAULT 0 NOT NULL,
	`rpe` real DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_workout_sets_workout_exercise_id_workout_exercises_id_fk` FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY,
	`date` text NOT NULL,
	`name` text DEFAULT 'Workout' NOT NULL,
	`session_id` text DEFAULT '' NOT NULL,
	`started_at` text DEFAULT '' NOT NULL,
	`finished_at` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `program_sessions_by_program` ON `program_sessions` (`program_id`);--> statement-breakpoint
CREATE INDEX `session_exercises_by_session` ON `session_exercises` (`session_id`);--> statement-breakpoint
CREATE INDEX `workout_exercises_by_workout` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_sets_by_entry` ON `workout_sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE INDEX `workouts_by_date` ON `workouts` (`date`);