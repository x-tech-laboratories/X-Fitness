// Diet: foods, recipes and what was eaten each day against the day's targets, a grocery list, and the categories and
// units they share. Energy is kept in kcal and every other nutrient in grams.

// ── Imports ──────────────────────────────────────────────────────────────────

import { add_days, format_local, parse_local } from "@x-tech-laboratories/x-libs/dates";
import { asc, between, eq, sql, synced_tables, type InferInsertModel, type InferSelectModel } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, drizzle_of, new_id } from "../feature.ts";
import { diet_api } from "./api.ts";
import { label_preset_of, preset_target, shown_nutrients, target_of, target_preset_of, target_source, type TargetSource } from "./labels.ts";
import { search_foods, type LookupReply } from "./lookup.ts";
import { migrations } from "./migrations/index.ts";
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
  nutrients,
  rename_in_categories,
  serving_unit,
  unit_usage,
  type DiaryEntry,
  type EntryKind,
  type Food,
  type GroceryItem,
  type NutrientGroup,
  type NutrientKey,
  type Nutrients,
  type Recipe,
} from "./model.ts";
import { diet_categories, diet_diary, diet_foods, diet_grocery, diet_ingredients, diet_recipes, diet_tables, diet_units } from "./schema.ts";
import { diet_setting_defaults, type DietSettingKey } from "./settings.ts";
import { read_trilium_diet, write_trilium_diet, type DietDocument } from "./trilium.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

// The settings table is the shared store's, outside any Drizzle schema.
function read_setting(database: SqlDatabase, key: DietSettingKey): unknown {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : diet_setting_defaults[key];
}

// Every setting stored over the diet's defaults, as labels.ts reads them.
function read_settings(database: SqlDatabase): Record<string, unknown> {
  const rows = database.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return { ...diet_setting_defaults, ...Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)])) };
}

function day_targets(settings: Record<string, unknown>): Nutrients {
  return Object.fromEntries(nutrient_keys.map((key) => [key, target_of(settings, key)])) as Nutrients;
}

// ── Reading rows ─────────────────────────────────────────────────────────────

type NameTable = typeof diet_categories | typeof diet_units;

// SQLite's own row order breaks ties between rows logged or added at the same moment.
const insertion_order = sql`rowid`;

function food_of(row: InferSelectModel<typeof diet_foods>): Food {
  return normalize_food({
    ...row,
    portions: JSON.parse(row.portions),
    categories: JSON.parse(row.categories),
    nutrients: Object.fromEntries(nutrient_keys.map((key) => [key, row[key]])),
  });
}

function read_foods(database: SqlDatabase): Food[] {
  return drizzle_of(database).select().from(diet_foods).orderBy(sql`${diet_foods.name} COLLATE NOCASE`, asc(diet_foods.id)).all().map(food_of);
}

function read_recipes(database: SqlDatabase): Recipe[] {
  const db = drizzle_of(database);
  const ingredients = db
    .select({ recipe_id: diet_ingredients.recipe_id, food_id: diet_ingredients.food_id, amount: diet_ingredients.amount, unit: diet_ingredients.unit })
    .from(diet_ingredients)
    .orderBy(asc(diet_ingredients.position), insertion_order)
    .all();
  const rows = db.select().from(diet_recipes).orderBy(sql`${diet_recipes.name} COLLATE NOCASE`, asc(diet_recipes.id)).all();
  return rows.map((row) =>
    normalize_recipe({ ...row, categories: JSON.parse(row.categories), ingredients: ingredients.filter((ingredient) => ingredient.recipe_id === row.id) }),
  );
}

function read_diary(database: SqlDatabase, from: string, to: string): DiaryEntry[] {
  return drizzle_of(database).select().from(diet_diary).where(between(diet_diary.date, from, to)).orderBy(asc(diet_diary.date), asc(diet_diary.logged_at), insertion_order).all();
}

function read_grocery(database: SqlDatabase): GroceryItem[] {
  const rows = drizzle_of(database).select().from(diet_grocery).orderBy(asc(diet_grocery.added_at), insertion_order).all();
  return rows.map(({ added_at: _added_at, ...row }) => ({ ...row, done: row.done === 1 }));
}

function read_names(database: SqlDatabase, table: NameTable): string[] {
  return drizzle_of(database).select({ name: table.name }).from(table).all().map((row) => row.name);
}

// ── Writing rows ─────────────────────────────────────────────────────────────

function write_food(database: SqlDatabase, food: Food): void {
  const { id, ...changes }: InferInsertModel<typeof diet_foods> = {
    id: food.id,
    name: food.name,
    brand: food.brand,
    comment: food.comment,
    serving_size: food.serving_size,
    serving_unit: food.serving_unit,
    portions: JSON.stringify(food.portions),
    categories: JSON.stringify(food.categories),
    ...food.nutrients,
  };
  drizzle_of(database).insert(diet_foods).values({ id, ...changes }).onConflictDoUpdate({ target: diet_foods.id, set: changes }).run();
}

// The ingredients are replaced whole, since their order and number are part of the recipe.
function write_recipe(database: SqlDatabase, recipe: Recipe): void {
  const db = drizzle_of(database);
  const changes = { name: recipe.name, comment: recipe.comment, servings: recipe.servings, serving_unit: recipe.serving_unit, categories: JSON.stringify(recipe.categories) };
  db.insert(diet_recipes).values({ id: recipe.id, ...changes }).onConflictDoUpdate({ target: diet_recipes.id, set: changes }).run();
  db.delete(diet_ingredients).where(eq(diet_ingredients.recipe_id, recipe.id)).run();
  recipe.ingredients.forEach((ingredient, position) =>
    db.insert(diet_ingredients).values({ id: new_id(), recipe_id: recipe.id, food_id: ingredient.food_id, amount: ingredient.amount, unit: ingredient.unit, position }).run(),
  );
}

function insert_entry(database: SqlDatabase, entry: DiaryEntry): void {
  drizzle_of(database).insert(diet_diary).values(entry).run();
}

function insert_grocery(database: SqlDatabase, item: GroceryItem, added_at: string): void {
  drizzle_of(database).insert(diet_grocery).values({ ...item, done: item.done ? 1 : 0, added_at }).run();
}

// Adds a name unless one differing only in case is already there.
function add_name(database: SqlDatabase, table: NameTable, name: string): void {
  if (read_names(database, table).some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
  drizzle_of(database).insert(table).values({ name }).run();
}

function delete_name(database: SqlDatabase, table: NameTable, name: string): void {
  drizzle_of(database).delete(table).where(eq(table.name, name)).run();
}

// Rewrites the categories of every food and recipe whose list changes, leaving the rest untouched for sync.
function map_item_categories(database: SqlDatabase, change: (categories: string[]) => string[]): void {
  const db = drizzle_of(database);
  for (const table of [diet_foods, diet_recipes]) {
    for (const row of db.select({ id: table.id, categories: table.categories }).from(table).all()) {
      const next = JSON.stringify(change(JSON.parse(row.categories) as string[]));
      if (next !== row.categories) db.update(table).set({ categories: next }).where(eq(table.id, row.id)).run();
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
  // The targets in force, 0 meaning none.
  targets: Nutrients;
}

export interface NutrientTarget {
  key: NutrientKey;
  label: string;
  // What the target is in: kcal for calories and grams for the rest.
  unit: "kcal" | "g";
  group: NutrientGroup;
  // Whether the page shows it, by the nutrition label and the nutrients switched by hand.
  shown: boolean;
  // A goal is an amount to reach, so going past it is fine; otherwise the target is a limit.
  goal: boolean;
  // The target in force, 0 meaning none.
  target: number;
  // What the target preset gives, 0 meaning none.
  preset_target: number;
  // Whether the target comes from the plan on Calculators → Goals, was set by hand, or follows the preset.
  source: TargetSource;
}

export interface DietTargets {
  label: string;
  targets_preset: string;
  nutrients: NutrientTarget[];
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
    categories: all_categories([...read_names(database, diet_categories), ...foods.flatMap((food) => food.categories), ...recipes.flatMap((recipe) => recipe.categories)]),
    units: normalize_names([
      ...read_names(database, diet_units),
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
    categories: normalize_names(read_names(database, diet_categories)),
    units: normalize_names(read_names(database, diet_units)),
    foods: read_foods(database),
    recipes: read_recipes(database),
    diary: read_diary(database, "0000-00-00", "9999-99-99"),
    grocery: read_grocery(database),
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

export const diet_feature = define_feature({
  id: "diet",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(diet_tables),
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
      drizzle_of(database).delete(diet_foods).where(eq(diet_foods.id, id)).run();
    },
    save_recipe: (database: SqlDatabase, input: RecipeInput): string => {
      const recipe = normalize_recipe({ ...input, id: input.id || new_id() });
      if (!recipe.name) throw new Error("A recipe needs a name.");
      in_transaction(database, () => write_recipe(database, recipe));
      return recipe.id;
    },
    delete_recipe: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(diet_recipes).where(eq(diet_recipes.id, id)).run();
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
      return { date, entries, totals: day_totals(entries, foods, recipes), targets: day_targets(read_settings(database)) };
    },
    get_diet_targets: (database: SqlDatabase): DietTargets => {
      const settings = read_settings(database);
      const shown = new Set(shown_nutrients(settings).map((info) => info.key));
      return {
        label: label_preset_of(settings).label,
        targets_preset: target_preset_of(settings).label,
        // Salt is sodium seen another way, so each stored nutrient comes once.
        nutrients: nutrients
          .filter((info) => !info.scale)
          .map((info) => ({
            key: info.key,
            label: info.label,
            unit: info.shown === "energy" ? "kcal" : "g",
            group: info.group,
            shown: shown.has(info.key),
            goal: info.goal === true,
            target: target_of(settings, info.key),
            preset_target: preset_target(settings, info.key),
            source: target_source(settings, info.key),
          })),
      };
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
      drizzle_of(database).delete(diet_diary).where(eq(diet_diary.id, id)).run();
    },

    // ── Categories ──

    add_category: (database: SqlDatabase, name: string): void => {
      const normalized = normalize_category_name(name);
      if (!normalized) throw new Error("A category needs a name.");
      add_name(database, diet_categories, normalized);
    },
    rename_category: (database: SqlDatabase, from: string, to: string): void => {
      const target = normalize_category_name(to);
      if (!target || target === from) return;
      in_transaction(database, () => {
        map_item_categories(database, (categories) => rename_in_categories(categories, from, target));
        const managed = read_names(database, diet_categories);
        const renamed = rename_in_categories(managed, from, target);
        for (const name of managed.filter((name) => !renamed.includes(name))) delete_name(database, diet_categories, name);
        for (const name of renamed) add_name(database, diet_categories, name);
      });
    },
    // The category and its subcategories leave every food and recipe; the items themselves stay.
    delete_category: (database: SqlDatabase, name: string): void => {
      in_transaction(database, () => {
        map_item_categories(database, (categories) => drop_from_categories(categories, name));
        for (const managed of read_names(database, diet_categories)) {
          if (!drop_from_categories([managed], name).length) delete_name(database, diet_categories, managed);
        }
      });
    },

    // ── Units ──

    add_unit: (database: SqlDatabase, name: string): void => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("A unit needs a name.");
      add_name(database, diet_units, trimmed);
    },
    // Every food, recipe and grocery line using the unit moves to the new name, which merges the two when it exists.
    rename_unit: (database: SqlDatabase, from: string, to: string): void => {
      const target = to.trim();
      if (!target || target === from) return;
      in_transaction(database, () => {
        const db = drizzle_of(database);
        db.update(diet_foods).set({ serving_unit: target }).where(eq(diet_foods.serving_unit, from)).run();
        db.update(diet_recipes).set({ serving_unit: target }).where(eq(diet_recipes.serving_unit, from)).run();
        db.update(diet_grocery).set({ unit: target }).where(eq(diet_grocery.unit, from)).run();
        if (read_names(database, diet_units).includes(from)) {
          delete_name(database, diet_units, from);
          add_name(database, diet_units, target);
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
      delete_name(database, diet_units, name);
    },

    // ── Grocery ──

    // The unit and brand start from the food's own, and the comment too when Settings asks for it.
    add_grocery_item: (database: SqlDatabase, input: GroceryInput): string => {
      const db = drizzle_of(database);
      const row = db.select().from(diet_foods).where(eq(diet_foods.id, input.food_id)).get();
      if (!row) throw new Error("Pick a food to add.");
      const food = food_of(row);
      if (db.select({ id: diet_grocery.id }).from(diet_grocery).where(eq(diet_grocery.food_id, food.id)).get()) throw new Error(`${food_label(food)} is already on the list.`);
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
      const assignments: Partial<InferInsertModel<typeof diet_grocery>> = {};
      if (changes.brand !== undefined) assignments.brand = changes.brand.trim();
      if (changes.amount !== undefined) assignments.amount = positive(changes.amount, "The amount");
      if (changes.unit !== undefined && changes.unit.trim()) assignments.unit = changes.unit.trim();
      if (changes.comment !== undefined) assignments.comment = changes.comment;
      if (changes.done !== undefined) assignments.done = changes.done ? 1 : 0;
      if (!Object.keys(assignments).length) return;
      drizzle_of(database).update(diet_grocery).set(assignments).where(eq(diet_grocery.id, id)).run();
    },
    remove_grocery_item: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(diet_grocery).where(eq(diet_grocery.id, id)).run();
    },
    clear_bought_groceries: (database: SqlDatabase): number => {
      return Number(drizzle_of(database).delete(diet_grocery).where(eq(diet_grocery.done, 1)).run().changes);
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
        const db = drizzle_of(database);
        for (const name of document.categories) add_name(database, diet_categories, name);
        for (const name of document.units) add_name(database, diet_units, name);
        for (const food of document.foods) write_food(database, food);
        for (const recipe of document.recipes) write_recipe(database, recipe);
        let diary = 0;
        for (const entry of document.diary) {
          if (db.select({ id: diet_diary.id }).from(diet_diary).where(eq(diet_diary.id, entry.id)).get()) continue;
          insert_entry(database, entry);
          diary += 1;
        }
        let grocery = 0;
        document.grocery.forEach((item, index) => {
          if (db.select({ id: diet_grocery.id }).from(diet_grocery).where(eq(diet_grocery.id, item.id)).get()) return;
          insert_grocery(database, item, new Date(now + index).toISOString());
          grocery += 1;
        });
        return { foods: document.foods.length, recipes: document.recipes.length, diary, grocery };
      });
    },
  },
});

