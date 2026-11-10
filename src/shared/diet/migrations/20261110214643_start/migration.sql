CREATE TABLE `diet_categories` (
	`name` text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE `diet_diary` (
	`id` text PRIMARY KEY,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`logged_at` text NOT NULL,
	CONSTRAINT "diet_diary_kind" CHECK("kind" IN ('food', 'recipe'))
);
--> statement-breakpoint
CREATE TABLE `diet_foods` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`serving_size` real DEFAULT 100 NOT NULL,
	`serving_unit` text DEFAULT 'g' NOT NULL,
	`portions` text DEFAULT '[]' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein` real DEFAULT 0 NOT NULL,
	`carbs` real DEFAULT 0 NOT NULL,
	`fat` real DEFAULT 0 NOT NULL,
	`fiber` real DEFAULT 0 NOT NULL,
	`sugar` real DEFAULT 0 NOT NULL,
	`saturated_fat` real DEFAULT 0 NOT NULL,
	`sodium` real DEFAULT 0 NOT NULL,
	`cholesterol` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diet_grocery` (
	`id` text PRIMARY KEY,
	`food_id` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`amount` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diet_ingredients` (
	`id` text PRIMARY KEY,
	`recipe_id` text NOT NULL,
	`food_id` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_diet_ingredients_recipe_id_diet_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `diet_recipes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `diet_recipes` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`serving_unit` text DEFAULT 'serving' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diet_units` (
	`name` text PRIMARY KEY
);
--> statement-breakpoint
CREATE INDEX `diet_diary_date` ON `diet_diary` (`date`);--> statement-breakpoint
CREATE INDEX `diet_ingredients_recipe` ON `diet_ingredients` (`recipe_id`);