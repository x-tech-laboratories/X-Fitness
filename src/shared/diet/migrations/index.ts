// Written by x-libs-bundle-migrations from the migration folders beside it; run it again after drizzle-kit generate.

import type { DrizzleMigration } from "@x-tech-laboratories/x-libs/drizzle";

export const migrations: DrizzleMigration[] = [
  {
    "name": "20261110214643_start",
    "statements": [
      "CREATE TABLE `diet_categories` (\n\t`name` text PRIMARY KEY\n);",
      "CREATE TABLE `diet_diary` (\n\t`id` text PRIMARY KEY,\n\t`date` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`ref_id` text NOT NULL,\n\t`amount` real NOT NULL,\n\t`unit` text DEFAULT '' NOT NULL,\n\t`logged_at` text NOT NULL,\n\tCONSTRAINT \"diet_diary_kind\" CHECK(\"kind\" IN ('food', 'recipe'))\n);",
      "CREATE TABLE `diet_foods` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL,\n\t`brand` text DEFAULT '' NOT NULL,\n\t`comment` text DEFAULT '' NOT NULL,\n\t`serving_size` real DEFAULT 100 NOT NULL,\n\t`serving_unit` text DEFAULT 'g' NOT NULL,\n\t`portions` text DEFAULT '[]' NOT NULL,\n\t`categories` text DEFAULT '[]' NOT NULL,\n\t`calories` real DEFAULT 0 NOT NULL,\n\t`protein` real DEFAULT 0 NOT NULL,\n\t`carbs` real DEFAULT 0 NOT NULL,\n\t`fat` real DEFAULT 0 NOT NULL,\n\t`fiber` real DEFAULT 0 NOT NULL,\n\t`sugar` real DEFAULT 0 NOT NULL,\n\t`saturated_fat` real DEFAULT 0 NOT NULL,\n\t`sodium` real DEFAULT 0 NOT NULL,\n\t`cholesterol` real DEFAULT 0 NOT NULL\n);",
      "CREATE TABLE `diet_grocery` (\n\t`id` text PRIMARY KEY,\n\t`food_id` text NOT NULL,\n\t`brand` text DEFAULT '' NOT NULL,\n\t`amount` real DEFAULT 1 NOT NULL,\n\t`unit` text DEFAULT '' NOT NULL,\n\t`comment` text DEFAULT '' NOT NULL,\n\t`done` integer DEFAULT 0 NOT NULL,\n\t`added_at` text NOT NULL\n);",
      "CREATE TABLE `diet_ingredients` (\n\t`id` text PRIMARY KEY,\n\t`recipe_id` text NOT NULL,\n\t`food_id` text NOT NULL,\n\t`amount` real NOT NULL,\n\t`unit` text DEFAULT '' NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL,\n\tCONSTRAINT `fk_diet_ingredients_recipe_id_diet_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `diet_recipes`(`id`) ON DELETE CASCADE\n);",
      "CREATE TABLE `diet_recipes` (\n\t`id` text PRIMARY KEY,\n\t`name` text NOT NULL,\n\t`comment` text DEFAULT '' NOT NULL,\n\t`servings` real DEFAULT 1 NOT NULL,\n\t`serving_unit` text DEFAULT 'serving' NOT NULL,\n\t`categories` text DEFAULT '[]' NOT NULL\n);",
      "CREATE TABLE `diet_units` (\n\t`name` text PRIMARY KEY\n);",
      "CREATE INDEX `diet_diary_date` ON `diet_diary` (`date`);",
      "CREATE INDEX `diet_ingredients_recipe` ON `diet_ingredients` (`recipe_id`);"
    ]
  }
];
