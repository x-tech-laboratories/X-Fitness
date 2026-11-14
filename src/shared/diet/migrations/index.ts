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
  },
  {
    "name": "20261114014020_more_nutrients",
    "statements": [
      "ALTER TABLE `diet_foods` ADD `vitamin_a` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `vitamin_c` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `vitamin_d` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `vitamin_e` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `vitamin_k` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `thiamin` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `riboflavin` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `niacin` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `pantothenic_acid` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `vitamin_b6` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `folate` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `vitamin_b12` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `choline` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `calcium` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `iron` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `magnesium` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `phosphorus` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `potassium` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `zinc` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `copper` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `manganese` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `selenium` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `iodine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `added_sugars` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `starch` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `sugar_alcohols` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `trans_fat` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `monounsaturated_fat` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `polyunsaturated_fat` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `omega_3` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `omega_6` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `biotin` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `beta_carotene` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `lycopene` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `lutein_zeaxanthin` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `chromium` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `molybdenum` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `chloride` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `fluoride` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `tryptophan` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `threonine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `isoleucine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `leucine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `lysine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `methionine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `cystine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `phenylalanine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `tyrosine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `valine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `arginine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `histidine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `alanine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `aspartic_acid` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `glutamic_acid` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `glycine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `proline` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `serine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `alcohol` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `caffeine` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `water` real DEFAULT 0 NOT NULL;"
    ]
  },
  {
    "name": "20261114020437_fiber_fatty_acids_antinutrients",
    "statements": [
      "ALTER TABLE `diet_foods` ADD `soluble_fiber` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `insoluble_fiber` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `ala` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `epa` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `dha` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `linoleic_acid` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `arachidonic_acid` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `oxalate` real DEFAULT 0 NOT NULL;",
      "ALTER TABLE `diet_foods` ADD `phytate` real DEFAULT 0 NOT NULL;"
    ]
  },
  {
    "name": "20261114021333_diary_meals",
    "statements": [
      "ALTER TABLE `diet_diary` ADD `meal` text DEFAULT '' NOT NULL;"
    ]
  },
  {
    "name": "20261114023806_category_tree",
    "statements": [
      "CREATE TABLE `__new_diet_categories` (\n\t`id` text PRIMARY KEY,\n\t`parent_id` text,\n\t`name` text DEFAULT '' NOT NULL,\n\t`position` real DEFAULT 0 NOT NULL\n);",
      "WITH RECURSIVE named(path) AS (\n  SELECT `name` FROM `diet_categories`\n  UNION SELECT value FROM `diet_foods`, json_each(`diet_foods`.`categories`) WHERE json_valid(`diet_foods`.`categories`) AND type = 'text'\n  UNION SELECT value FROM `diet_recipes`, json_each(`diet_recipes`.`categories`) WHERE json_valid(`diet_recipes`.`categories`) AND type = 'text'\n), every_path(path) AS (\n  SELECT path FROM named WHERE path <> ''\n  UNION SELECT substr(path, 1, length(rtrim(path, replace(path, '/', ''))) - 1) FROM every_path WHERE instr(path, '/') > 0\n)\nINSERT INTO `__new_diet_categories` (`id`) SELECT path FROM every_path;",
      "UPDATE `__new_diet_categories` SET\n  `parent_id` = CASE WHEN instr(`id`, '/') > 0 THEN substr(`id`, 1, length(rtrim(`id`, replace(`id`, '/', ''))) - 1) END,\n  `name` = substr(`id`, length(rtrim(`id`, replace(`id`, '/', ''))) + 1);",
      "UPDATE `__new_diet_categories` SET `position` = (\n  SELECT count(*) FROM `__new_diet_categories` AS `other`\n  WHERE `other`.`parent_id` IS `__new_diet_categories`.`parent_id` AND `other`.`name` COLLATE NOCASE < `__new_diet_categories`.`name` COLLATE NOCASE\n);",
      "DROP TABLE `diet_categories`;",
      "ALTER TABLE `__new_diet_categories` RENAME TO `diet_categories`;"
    ]
  }
];
