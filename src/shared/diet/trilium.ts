// The Trilium Diet Manager add-on's database file, read into the store's shapes and written back from them. The add-on
// keeps sodium and cholesterol in mg and names its fields in camelCase; this store keeps grams and snake_case.

// ── Imports ──────────────────────────────────────────────────────────────────

import { normalize_category_path, normalize_category_refs } from "../category_tree.ts";
import {
  normalize_food,
  normalize_names,
  normalize_recipe,
  nutrient_keys,
  serving_unit,
  type DiaryEntry,
  type Food,
  type GroceryItem,
  type NutrientKey,
  type Nutrients,
  type Recipe,
} from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface DietDocument {
  // Categories as "/" paths, here and on each food and recipe.
  categories: string[];
  units: string[];
  foods: Food[];
  recipes: Recipe[];
  diary: DiaryEntry[];
  grocery: GroceryItem[];
}

// The add-on's name for a nutrient, such as saturatedFat; the vitamins and minerals it lacks travel in grams under theirs.
const camel_keys = Object.fromEntries(nutrient_keys.map((key) => [key, key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())])) as Record<NutrientKey, string>;

// The nutrients the add-on writes in mg.
const milligram_keys: NutrientKey[] = ["sodium", "cholesterol"];

type Json = Record<string, unknown>;

function object_of(raw: unknown): Json {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Json) : {};
}

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// ── Reading ──────────────────────────────────────────────────────────────────

function read_nutrients(raw: unknown): Record<string, number> {
  const source = object_of(raw);
  const values: Record<string, number> = {};
  for (const key of nutrient_keys) {
    const value = Number(source[camel_keys[key]]);
    values[key] = Number.isFinite(value) ? (milligram_keys.includes(key) ? value / 1000 : value) : 0;
  }
  return values;
}

function read_food(id: string, raw: unknown): Food {
  const food = object_of(raw);
  const portions = Array.isArray(food.portions)
    ? food.portions.map((item) => {
        const portion = object_of(item);
        return { unit: portion.unit, amount: portion.amount, size: portion.size, size_unit: portion.sizeUnit };
      })
    : [];
  return normalize_food({
    id,
    name: food.name,
    brand: food.brand,
    comment: food.comment,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
    portions,
    categories: food.tags,
    nutrients: read_nutrients(food.nutrients),
  });
}

function read_recipe(id: string, raw: unknown): Recipe {
  const recipe = object_of(raw);
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((item) => {
        const ingredient = object_of(item);
        return { food_id: ingredient.foodId, amount: ingredient.amount, unit: ingredient.unit };
      })
    : [];
  return normalize_recipe({ id, name: recipe.name, comment: recipe.comment, servings: recipe.servings, serving_unit: recipe.servingUnit, categories: recipe.tags, ingredients });
}

// An entry without a unit counted whole servings, which is what it still means.
function read_entry(date: string, raw: unknown, fallback_time: string): DiaryEntry {
  const entry = object_of(raw);
  const kind = entry.kind === "recipe" ? "recipe" : "food";
  const amount = Number(entry.servings);
  return {
    id: text(entry.id),
    date,
    kind,
    ref_id: text(entry.refId),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 1,
    unit: kind === "food" ? text(entry.unit) || serving_unit : "",
    logged_at: text(entry.loggedAt) || fallback_time,
    meal: text(entry.meal),
  };
}

function read_grocery(raw: unknown, foods: Map<string, Food>): GroceryItem {
  const item = object_of(raw);
  const food = foods.get(text(item.foodId));
  const amount = Number(item.amount);
  return {
    id: text(item.id),
    food_id: text(item.foodId),
    brand: typeof item.brand === "string" ? item.brand.trim() : (food?.brand ?? ""),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 1,
    unit: text(item.unit) || food?.serving_unit || "g",
    comment: typeof item.comment === "string" ? item.comment : "",
    done: item.done === true,
  };
}

// Throws on anything that is not recognisably the add-on's database, so nothing is imported from it.
export function read_trilium_diet(json_text: string, now = new Date().toISOString()): DietDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(json_text).trim());
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object with foods, recipes and diary.");
  const source = parsed as Json;

  const foods = Object.entries(object_of(source.foods)).map(([id, food]) => read_food(id, food)).filter((food) => food.id);
  const foods_by_id = new Map(foods.map((food) => [food.id, food]));
  const recipes = Object.entries(object_of(source.recipes)).map(([id, recipe]) => read_recipe(id, recipe)).filter((recipe) => recipe.id);
  const diary = Object.entries(object_of(source.diary))
    .filter(([date, entries]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(entries))
    .flatMap(([date, entries]) => (entries as unknown[]).map((entry) => read_entry(date, entry, now)));
  const grocery = Array.isArray(source.grocery) ? source.grocery.map((item) => read_grocery(item, foods_by_id)) : [];

  return {
    categories: normalize_category_refs(Array.isArray(source.categories) ? source.categories.map(normalize_category_path) : []),
    units: normalize_names(source.units),
    foods,
    recipes,
    diary: diary.filter((entry) => entry.id && entry.ref_id),
    grocery: grocery.filter((item) => item.id && item.food_id),
  };
}

// ── Writing ──────────────────────────────────────────────────────────────────

// Rounded so grams turned back into mg read as they were typed.
function write_nutrients(values: Nutrients): Json {
  return Object.fromEntries(nutrient_keys.map((key) => [camel_keys[key], milligram_keys.includes(key) ? Number((values[key] * 1000).toFixed(6)) : values[key]]));
}

// The add-on's own format, which it imports back and which this app imports again without duplicates.
export function write_trilium_diet(document: DietDocument): string {
  const diary: Record<string, Json[]> = {};
  for (const entry of document.diary) {
    (diary[entry.date] ??= []).push({ id: entry.id, kind: entry.kind, refId: entry.ref_id, servings: entry.amount, unit: entry.unit, loggedAt: entry.logged_at, meal: entry.meal });
  }
  return JSON.stringify(
    {
      categories: document.categories,
      units: document.units,
      foods: Object.fromEntries(
        document.foods.map((food) => [
          food.id,
          {
            id: food.id,
            name: food.name,
            brand: food.brand,
            comment: food.comment,
            servingSize: food.serving_size,
            servingUnit: food.serving_unit,
            portions: food.portions.map((portion) => ({ unit: portion.unit, amount: portion.amount, size: portion.size, sizeUnit: portion.size_unit })),
            tags: food.categories,
            nutrients: write_nutrients(food.nutrients),
          },
        ]),
      ),
      recipes: Object.fromEntries(
        document.recipes.map((recipe) => [
          recipe.id,
          {
            id: recipe.id,
            name: recipe.name,
            comment: recipe.comment,
            servings: recipe.servings,
            servingUnit: recipe.serving_unit,
            tags: recipe.categories,
            ingredients: recipe.ingredients.map((ingredient) => ({ foodId: ingredient.food_id, amount: ingredient.amount, unit: ingredient.unit })),
          },
        ]),
      ),
      diary,
      grocery: document.grocery.map((item) => ({ id: item.id, foodId: item.food_id, brand: item.brand, amount: item.amount, unit: item.unit, comment: item.comment, done: item.done })),
    },
    null,
    4,
  );
}
