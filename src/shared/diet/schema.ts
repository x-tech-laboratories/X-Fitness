// The diet tables, from which drizzle-kit writes the migrations and the store reads its row types.

// ── Imports ──────────────────────────────────────────────────────────────────

import { check, index, integer, real, sql, sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

export const diet_categories = sqliteTable("diet_categories", {
  name: text().primaryKey(),
});

export const diet_units = sqliteTable("diet_units", {
  name: text().primaryKey(),
});

// Portions and categories are JSON arrays; the nutrients are per serving, as model.ts lists them.
export const diet_foods = sqliteTable("diet_foods", {
  id: text().primaryKey(),
  name: text().notNull(),
  brand: text().notNull().default(""),
  comment: text().notNull().default(""),
  serving_size: real().notNull().default(100),
  serving_unit: text().notNull().default("g"),
  portions: text().notNull().default("[]"),
  categories: text().notNull().default("[]"),
  calories: real().notNull().default(0),
  protein: real().notNull().default(0),
  carbs: real().notNull().default(0),
  fat: real().notNull().default(0),
  fiber: real().notNull().default(0),
  sugar: real().notNull().default(0),
  saturated_fat: real().notNull().default(0),
  sodium: real().notNull().default(0),
  cholesterol: real().notNull().default(0),
});

export const diet_recipes = sqliteTable("diet_recipes", {
  id: text().primaryKey(),
  name: text().notNull(),
  comment: text().notNull().default(""),
  servings: real().notNull().default(1),
  serving_unit: text().notNull().default("serving"),
  categories: text().notNull().default("[]"),
});

export const diet_ingredients = sqliteTable(
  "diet_ingredients",
  {
    id: text().primaryKey(),
    recipe_id: text()
      .notNull()
      .references(() => diet_recipes.id, { onDelete: "cascade" }),
    food_id: text().notNull(),
    amount: real().notNull(),
    unit: text().notNull().default(""),
    position: integer().notNull().default(0),
  },
  (table) => [index("diet_ingredients_recipe").on(table.recipe_id)],
);

export const diet_diary = sqliteTable(
  "diet_diary",
  {
    id: text().primaryKey(),
    date: text().notNull(),
    kind: text({ enum: ["food", "recipe"] }).notNull(),
    ref_id: text().notNull(),
    amount: real().notNull(),
    unit: text().notNull().default(""),
    logged_at: text().notNull(),
  },
  (table) => [index("diet_diary_date").on(table.date), check("diet_diary_kind", sql`${table.kind} IN ('food', 'recipe')`)],
);

export const diet_grocery = sqliteTable("diet_grocery", {
  id: text().primaryKey(),
  food_id: text().notNull(),
  brand: text().notNull().default(""),
  amount: real().notNull().default(1),
  unit: text().notNull().default(""),
  comment: text().notNull().default(""),
  done: integer().notNull().default(0),
  added_at: text().notNull(),
});

// Parents first, as sync applies them.
export const diet_tables = [diet_categories, diet_units, diet_foods, diet_recipes, diet_ingredients, diet_diary, diet_grocery];
