// Diet: foods, recipes and what was eaten each day against the day's targets, a grocery list, and the categories and
// units they share. Energy is kept in kcal and every other nutrient in grams.

// ── Imports ──────────────────────────────────────────────────────────────────

import { add_days, format_local, parse_local } from "@x-tech-laboratories/x-libs/dates";
import { in_transaction, type SqlDatabase, type SqlValue } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, new_id } from "../feature.ts";
import { diet_api } from "./api.ts";
import { search_foods, type LookupReply } from "./lookup.ts";
import {
  all_categories,
  by_id,
  day_totals,
  drop_from_categories,
  empty_nutrients,
  entry_nutrients,
  food_label,
  normalize_category_name,
  normalize_food,
  normalize_names,
  normalize_recipe,
  nutrient_keys,
  rename_in_categories,
  serving_unit,
  unit_usage,
  type DiaryEntry,
  type EntryKind,
  type Food,
  type GroceryItem,
  type Nutrients,
  type Recipe,
} from "./model.ts";
import { read_trilium_diet, write_trilium_diet, type DietDocument } from "./trilium.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

export const diet_setting_defaults = {
  "diet.target_calories": 2000,
  "diet.target_protein": 100,
  "diet.target_carbs": 250,
  "diet.target_fat": 65,
  "diet.target_fiber": 30,
  "diet.target_sugar": 50,
  "diet.target_saturated_fat": 20,
  "diet.target_sodium": 2.3,
  "diet.target_cholesterol": 0.3,
  "diet.usda_api_key": "",
  "diet.prefill_grocery_comment": false,
};

function read_setting(database: SqlDatabase, key: keyof typeof diet_setting_defaults): unknown {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : diet_setting_defaults[key];
}

// ── Schema ───────────────────────────────────────────────────────────────────

const nutrient_columns = nutrient_keys.map((key) => `${key} REAL NOT NULL DEFAULT 0`).join(",\n    ");

const migrations = [
  `CREATE TABLE diet_categories (name TEXT PRIMARY KEY);
  CREATE TABLE diet_units (name TEXT PRIMARY KEY);
  CREATE TABLE diet_foods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    serving_size REAL NOT NULL DEFAULT 100,
    serving_unit TEXT NOT NULL DEFAULT 'g',
    portions TEXT NOT NULL DEFAULT '[]',
    categories TEXT NOT NULL DEFAULT '[]',
    ${nutrient_columns}
  );
  CREATE TABLE diet_recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    servings REAL NOT NULL DEFAULT 1,
    serving_unit TEXT NOT NULL DEFAULT 'serving',
    categories TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE diet_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES diet_recipes (id) ON DELETE CASCADE,
    food_id TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX diet_ingredients_recipe ON diet_ingredients (recipe_id);
  CREATE TABLE diet_diary (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('food', 'recipe')),
    ref_id TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    logged_at TEXT NOT NULL
  );
  CREATE INDEX diet_diary_date ON diet_diary (date);
  CREATE TABLE diet_grocery (
    id TEXT PRIMARY KEY,
    food_id TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL
  );`,
];

// ── Reading rows ─────────────────────────────────────────────────────────────

type Row = Record<string, SqlValue>;

function food_of(row: Row): Food {
  return normalize_food({
    ...row,
    portions: JSON.parse(String(row.portions)),
    categories: JSON.parse(String(row.categories)),
    nutrients: Object.fromEntries(nutrient_keys.map((key) => [key, row[key]])),
  });
}

function read_foods(database: SqlDatabase): Food[] {
  return (database.prepare("SELECT * FROM diet_foods ORDER BY name COLLATE NOCASE, id").all() as Row[]).map(food_of);
}

function read_recipes(database: SqlDatabase): Recipe[] {
  const ingredients = database.prepare("SELECT recipe_id, food_id, amount, unit FROM diet_ingredients ORDER BY position, rowid").all() as Row[];
  const rows = database.prepare("SELECT * FROM diet_recipes ORDER BY name COLLATE NOCASE, id").all() as Row[];
  return rows.map((row) =>
    normalize_recipe({ ...row, categories: JSON.parse(String(row.categories)), ingredients: ingredients.filter((ingredient) => ingredient.recipe_id === row.id) }),
  );
}

function read_diary(database: SqlDatabase, from: string, to: string): DiaryEntry[] {
  const rows = database.prepare("SELECT * FROM diet_diary WHERE date BETWEEN ? AND ? ORDER BY date, logged_at, rowid").all(from, to) as Row[];
  return rows.map((row) => ({
    id: String(row.id),
    date: String(row.date),
    kind: row.kind as EntryKind,
    ref_id: String(row.ref_id),
    amount: Number(row.amount),
    unit: String(row.unit),
    logged_at: String(row.logged_at),
  }));
}

function read_grocery(database: SqlDatabase): GroceryItem[] {
  const rows = database.prepare("SELECT * FROM diet_grocery ORDER BY added_at, rowid").all() as Row[];
  return rows.map((row) => ({
    id: String(row.id),
    food_id: String(row.food_id),
    brand: String(row.brand),
    amount: Number(row.amount),
    unit: String(row.unit),
    comment: String(row.comment),
    done: Number(row.done) === 1,
  }));
}

function read_names(database: SqlDatabase, table: "diet_categories" | "diet_units"): string[] {
  return (database.prepare(`SELECT name FROM ${table}`).all() as { name: string }[]).map((row) => row.name);
}

// ── Writing rows ─────────────────────────────────────────────────────────────

function write_food(database: SqlDatabase, food: Food): void {
  const columns = ["id", "name", "brand", "comment", "serving_size", "serving_unit", "portions", "categories", ...nutrient_keys];
  const values: SqlValue[] = [
    food.id,
    food.name,
    food.brand,
    food.comment,
    food.serving_size,
    food.serving_unit,
    JSON.stringify(food.portions),
    JSON.stringify(food.categories),
    ...nutrient_keys.map((key) => food.nutrients[key]),
  ];
  const updates = columns.slice(1).map((column) => `${column} = excluded.${column}`).join(", ");
  database.prepare(`INSERT INTO diet_foods (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT (id) DO UPDATE SET ${updates}`).run(...values);
}

// The ingredients are replaced whole, since their order and number are part of the recipe.
function write_recipe(database: SqlDatabase, recipe: Recipe): void {
  database
    .prepare(
      `INSERT INTO diet_recipes (id, name, comment, servings, serving_unit, categories) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, comment = excluded.comment, servings = excluded.servings, serving_unit = excluded.serving_unit, categories = excluded.categories`,
    )
    .run(recipe.id, recipe.name, recipe.comment, recipe.servings, recipe.serving_unit, JSON.stringify(recipe.categories));
  database.prepare("DELETE FROM diet_ingredients WHERE recipe_id = ?").run(recipe.id);
  const insert = database.prepare("INSERT INTO diet_ingredients (id, recipe_id, food_id, amount, unit, position) VALUES (?, ?, ?, ?, ?, ?)");
  recipe.ingredients.forEach((ingredient, position) => insert.run(new_id(), recipe.id, ingredient.food_id, ingredient.amount, ingredient.unit, position));
}

function insert_entry(database: SqlDatabase, entry: DiaryEntry): void {
  database
    .prepare("INSERT INTO diet_diary (id, date, kind, ref_id, amount, unit, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(entry.id, entry.date, entry.kind, entry.ref_id, entry.amount, entry.unit, entry.logged_at);
}

function insert_grocery(database: SqlDatabase, item: GroceryItem, added_at: string): void {
  database
    .prepare("INSERT INTO diet_grocery (id, food_id, brand, amount, unit, comment, done, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(item.id, item.food_id, item.brand, item.amount, item.unit, item.comment, item.done ? 1 : 0, added_at);
}

// Adds a name unless one differing only in case is already there.
function add_name(database: SqlDatabase, table: "diet_categories" | "diet_units", name: string): void {
  if (read_names(database, table).some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
  database.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name);
}

// Rewrites the categories of every food and recipe whose list changes, leaving the rest untouched for sync.
function map_item_categories(database: SqlDatabase, change: (categories: string[]) => string[]): void {
  for (const table of ["diet_foods", "diet_recipes"]) {
    const rows = database.prepare(`SELECT id, categories FROM ${table}`).all() as { id: string; categories: string }[];
    for (const row of rows) {
      const next = JSON.stringify(change(JSON.parse(row.categories) as string[]));
      if (next !== row.categories) database.prepare(`UPDATE ${table} SET categories = ? WHERE id = ?`).run(next, row.id);
    }
  }
}

function positive(raw: unknown, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be more than 0.`);
  return value;
}

// ── Answers ──────────────────────────────────────────────────────────────────

export interface DietData {
  foods: Food[];
  recipes: Recipe[];
  // Every category: those made on their own, those carried, and every parent their paths imply.
  categories: string[];
  // Every unit: those made on their own and those in use.
  units: string[];
  brands: string[];
  grocery: GroceryItem[];
}

export interface DayEntry extends DiaryEntry {
  label: string;
  // False once the food or recipe it names was deleted.
  found: boolean;
  // The recipe's serving unit, or the entry's own unit for a food.
  unit_label: string;
  nutrients: Nutrients;
}

export interface DiaryDay {
  date: string;
  entries: DayEntry[];
  totals: Nutrients;
}

export interface DayTotals {
  date: string;
  entries: number;
  totals: Nutrients;
}

export interface ImportCounts {
  foods: number;
  recipes: number;
  diary: number;
  grocery: number;
}

export interface FoodInput {
  id?: string;
  name: string;
  brand?: string;
  comment?: string;
  serving_size: number;
  serving_unit: string;
  portions?: Food["portions"];
  categories?: string[];
  nutrients: Partial<Nutrients>;
}

export interface RecipeInput {
  id?: string;
  name: string;
  comment?: string;
  servings: number;
  serving_unit: string;
  categories?: string[];
  ingredients: Recipe["ingredients"];
}

export interface EntryInput {
  id?: string;
  date: string;
  kind: EntryKind;
  ref_id: string;
  amount: number;
  unit?: string;
  logged_at?: string;
}

export interface GroceryInput {
  food_id: string;
  amount: number;
  unit?: string;
  brand?: string;
  comment?: string;
}

export type GroceryChanges = Partial<Pick<GroceryItem, "brand" | "amount" | "unit" | "comment" | "done">>;

function get_diet(database: SqlDatabase): DietData {
  const foods = read_foods(database);
  const recipes = read_recipes(database);
  const grocery = read_grocery(database);
  return {
    foods,
    recipes,
    categories: all_categories([...read_names(database, "diet_categories"), ...foods.flatMap((food) => food.categories), ...recipes.flatMap((recipe) => recipe.categories)]),
    units: normalize_names([
      ...read_names(database, "diet_units"),
      ...foods.map((food) => food.serving_unit),
      ...recipes.map((recipe) => recipe.serving_unit),
      ...grocery.map((item) => item.unit),
    ]),
    brands: normalize_names([...foods.map((food) => food.brand), ...grocery.map((item) => item.brand)]),
    grocery,
  };
}

function read_document(database: SqlDatabase): DietDocument {
  return {
    categories: normalize_names(read_names(database, "diet_categories")),
    units: normalize_names(read_names(database, "diet_units")),
    foods: read_foods(database),
    recipes: read_recipes(database),
    diary: read_diary(database, "0000-00-00", "9999-99-99"),
    grocery: read_grocery(database),
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

export const diet_feature = define_feature({
  id: "diet",
  migrations,
  tables: [
    { name: "diet_categories", key_columns: ["name"] },
    { name: "diet_units", key_columns: ["name"] },
    { name: "diet_foods", key_columns: ["id"] },
    { name: "diet_recipes", key_columns: ["id"] },
    { name: "diet_ingredients", key_columns: ["id"] },
    { name: "diet_diary", key_columns: ["id"] },
    { name: "diet_grocery", key_columns: ["id"] },
  ],
  setting_defaults: diet_setting_defaults,
  api: diet_api,
  methods: {
    get_diet,

    // ── Foods and recipes ──

    save_food: (database: SqlDatabase, input: FoodInput): string => {
      const food = normalize_food({ ...input, id: input.id || new_id() });
      if (!food.name) throw new Error("A food needs a name.");
      write_food(database, food);
      return food.id;
    },
    delete_food: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM diet_foods WHERE id = ?").run(id);
    },
    save_recipe: (database: SqlDatabase, input: RecipeInput): string => {
      const recipe = normalize_recipe({ ...input, id: input.id || new_id() });
      if (!recipe.name) throw new Error("A recipe needs a name.");
      in_transaction(database, () => write_recipe(database, recipe));
      return recipe.id;
    },
    delete_recipe: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM diet_recipes WHERE id = ?").run(id);
    },

    // ── Diary ──

    get_diary_day: (database: SqlDatabase, date: string): DiaryDay => {
      const foods = by_id(read_foods(database));
      const recipes = by_id(read_recipes(database));
      const entries = read_diary(database, date, date).map((entry): DayEntry => {
        const item = entry.kind === "food" ? foods[entry.ref_id] : recipes[entry.ref_id];
        return {
          ...entry,
          label: item ? (entry.kind === "food" ? food_label(item as Food) : item.name) : "(deleted)",
          found: item !== undefined,
          unit_label: entry.kind === "recipe" ? ((item as Recipe | undefined)?.serving_unit ?? serving_unit) : entry.unit || serving_unit,
          nutrients: entry_nutrients(entry, foods, recipes),
        };
      });
      return { date, entries, totals: day_totals(entries, foods, recipes) };
    },
    // Every day from the first date to the last, those with nothing logged as zero.
    list_daily_totals: (database: SqlDatabase, from: string, to: string): DayTotals[] => {
      const foods = by_id(read_foods(database));
      const recipes = by_id(read_recipes(database));
      const entries = read_diary(database, from, to);
      const days: DayTotals[] = [];
      for (let day = parse_local(from); format_local(day, false) <= to; day = add_days(day, 1)) {
        const date = format_local(day, false);
        const logged = entries.filter((entry) => entry.date === date);
        days.push({ date, entries: logged.length, totals: logged.length ? day_totals(logged, foods, recipes) : empty_nutrients() });
      }
      return days;
    },
    add_diary_entry: (database: SqlDatabase, input: EntryInput): string => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("A diary entry needs a date.");
      if (!input.ref_id) throw new Error(`Pick a ${input.kind} to log.`);
      const kind: EntryKind = input.kind === "recipe" ? "recipe" : "food";
      const entry: DiaryEntry = {
        id: input.id || new_id(),
        date: input.date,
        kind,
        ref_id: input.ref_id,
        amount: positive(input.amount, "The amount"),
        unit: kind === "food" ? (input.unit ?? "").trim() || serving_unit : "",
        logged_at: input.logged_at || new Date().toISOString(),
      };
      insert_entry(database, entry);
      return entry.id;
    },
    remove_diary_entry: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM diet_diary WHERE id = ?").run(id);
    },

    // ── Categories ──

    add_category: (database: SqlDatabase, name: string): void => {
      const normalized = normalize_category_name(name);
      if (!normalized) throw new Error("A category needs a name.");
      add_name(database, "diet_categories", normalized);
    },
    rename_category: (database: SqlDatabase, from: string, to: string): void => {
      const target = normalize_category_name(to);
      if (!target || target === from) return;
      in_transaction(database, () => {
        map_item_categories(database, (categories) => rename_in_categories(categories, from, target));
        const managed = read_names(database, "diet_categories");
        const renamed = rename_in_categories(managed, from, target);
        for (const name of managed.filter((name) => !renamed.includes(name))) database.prepare("DELETE FROM diet_categories WHERE name = ?").run(name);
        for (const name of renamed) add_name(database, "diet_categories", name);
      });
    },
    // The category and its subcategories leave every food and recipe; the items themselves stay.
    delete_category: (database: SqlDatabase, name: string): void => {
      in_transaction(database, () => {
        map_item_categories(database, (categories) => drop_from_categories(categories, name));
        for (const managed of read_names(database, "diet_categories")) {
          if (!drop_from_categories([managed], name).length) database.prepare("DELETE FROM diet_categories WHERE name = ?").run(managed);
        }
      });
    },

    // ── Units ──

    add_unit: (database: SqlDatabase, name: string): void => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("A unit needs a name.");
      add_name(database, "diet_units", trimmed);
    },
    // Every food, recipe and grocery line using the unit moves to the new name, which merges the two when it exists.
    rename_unit: (database: SqlDatabase, from: string, to: string): void => {
      const target = to.trim();
      if (!target || target === from) return;
      in_transaction(database, () => {
        database.prepare("UPDATE diet_foods SET serving_unit = ? WHERE serving_unit = ?").run(target, from);
        database.prepare("UPDATE diet_recipes SET serving_unit = ? WHERE serving_unit = ?").run(target, from);
        database.prepare("UPDATE diet_grocery SET unit = ? WHERE unit = ?").run(target, from);
        if (read_names(database, "diet_units").includes(from)) {
          database.prepare("DELETE FROM diet_units WHERE name = ?").run(from);
          add_name(database, "diet_units", target);
        }
      });
    },
    // A unit still in use stays, since what uses it must keep some unit; renaming it onto another moves them first.
    delete_unit: (database: SqlDatabase, name: string): void => {
      const data = get_diet(database);
      const usage = unit_usage(data.foods, data.recipes, data.grocery, name);
      if (usage.foods + usage.recipes + usage.grocery > 0) {
        throw new Error(
          `"${name}" is still used by ${usage.foods} food(s), ${usage.recipes} recipe(s) and ${usage.grocery} grocery line(s). Rename it onto another unit to move them over, then delete it.`,
        );
      }
      database.prepare("DELETE FROM diet_units WHERE name = ?").run(name);
    },

    // ── Grocery ──

    // The unit and brand start from the food's own, and the comment too when Settings asks for it.
    add_grocery_item: (database: SqlDatabase, input: GroceryInput): string => {
      const row = database.prepare("SELECT * FROM diet_foods WHERE id = ?").get(input.food_id) as Row | undefined;
      if (!row) throw new Error("Pick a food to add.");
      const food = food_of(row);
      if (database.prepare("SELECT 1 FROM diet_grocery WHERE food_id = ?").get(food.id)) throw new Error(`${food_label(food)} is already on the list.`);
      const prefill = read_setting(database, "diet.prefill_grocery_comment") === true;
      const item: GroceryItem = {
        id: new_id(),
        food_id: food.id,
        brand: input.brand !== undefined ? input.brand.trim() : food.brand,
        amount: positive(input.amount, "The amount"),
        unit: (input.unit ?? "").trim() || food.serving_unit,
        comment: input.comment !== undefined ? input.comment : prefill ? food.comment : "",
        done: false,
      };
      insert_grocery(database, item, new Date().toISOString());
      return item.id;
    },
    update_grocery_item: (database: SqlDatabase, id: string, changes: GroceryChanges): void => {
      const assignments: [string, SqlValue][] = [];
      if (changes.brand !== undefined) assignments.push(["brand", changes.brand.trim()]);
      if (changes.amount !== undefined) assignments.push(["amount", positive(changes.amount, "The amount")]);
      if (changes.unit !== undefined && changes.unit.trim()) assignments.push(["unit", changes.unit.trim()]);
      if (changes.comment !== undefined) assignments.push(["comment", changes.comment]);
      if (changes.done !== undefined) assignments.push(["done", changes.done ? 1 : 0]);
      if (!assignments.length) return;
      database.prepare(`UPDATE diet_grocery SET ${assignments.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`).run(...assignments.map(([, value]) => value), id);
    },
    remove_grocery_item: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM diet_grocery WHERE id = ?").run(id);
    },
    clear_bought_groceries: (database: SqlDatabase): number => {
      return Number(database.prepare("DELETE FROM diet_grocery WHERE done = 1").run().changes);
    },

    // ── Lookup ──

    // Uses the USDA key kept in Settings, so the key never travels with the call.
    search_online_foods: (database: SqlDatabase, query: string): Promise<LookupReply> => {
      return search_foods(query, String(read_setting(database, "diet.usda_api_key") ?? ""));
    },

    // ── Import and export ──

    // The whole diet in the Trilium add-on's own format.
    export_diet_json: (database: SqlDatabase): string => {
      return write_trilium_diet(read_document(database));
    },
    // Merges the add-on's database.json: foods and recipes replace those with the same id, diary entries and grocery lines
    // are added unless their id is already here, and categories and units join the lists; importing twice changes nothing more.
    import_trilium_diet: (database: SqlDatabase, json_text: string): ImportCounts => {
      const document = read_trilium_diet(json_text);
      const now = Date.now();
      return in_transaction(database, () => {
        for (const name of document.categories) add_name(database, "diet_categories", name);
        for (const name of document.units) add_name(database, "diet_units", name);
        for (const food of document.foods) write_food(database, food);
        for (const recipe of document.recipes) write_recipe(database, recipe);
        let diary = 0;
        for (const entry of document.diary) {
          if (database.prepare("SELECT 1 FROM diet_diary WHERE id = ?").get(entry.id)) continue;
          insert_entry(database, entry);
          diary += 1;
        }
        let grocery = 0;
        document.grocery.forEach((item, index) => {
          if (database.prepare("SELECT 1 FROM diet_grocery WHERE id = ?").get(item.id)) return;
          insert_grocery(database, item, new Date(now + index).toISOString());
          grocery += 1;
        });
        return { foods: document.foods.length, recipes: document.recipes.length, diary, grocery };
      });
    },
  },
});

