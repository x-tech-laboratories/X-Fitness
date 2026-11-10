// What the diet keeps and the rules that turn amounts into nutrients: the nutrients tracked, categories as nested paths,
// the units a food can be measured in, and the sums for a recipe and a day. Everything here is plain data, so the store
// and the page share it.

// ── Nutrients ────────────────────────────────────────────────────────────────

export const nutrient_keys = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "saturated_fat", "sodium", "cholesterol"] as const;

export type NutrientKey = (typeof nutrient_keys)[number];

// Energy in kcal and every other nutrient in grams, per the food's own serving.
export type Nutrients = Record<NutrientKey, number>;

export interface NutrientInfo {
  key: NutrientKey;
  label: string;
  // Energy follows the energy unit chosen in Settings; sodium and cholesterol read better in mg.
  shown: "energy" | "g" | "mg";
  group: "macros" | "other";
}

export const nutrients: NutrientInfo[] = [
  { key: "calories", label: "Calories", shown: "energy", group: "macros" },
  { key: "protein", label: "Protein", shown: "g", group: "macros" },
  { key: "carbs", label: "Carbs", shown: "g", group: "macros" },
  { key: "fat", label: "Fat", shown: "g", group: "macros" },
  { key: "fiber", label: "Fiber", shown: "g", group: "other" },
  { key: "sugar", label: "Sugar", shown: "g", group: "other" },
  { key: "saturated_fat", label: "Saturated Fat", shown: "g", group: "other" },
  { key: "sodium", label: "Sodium", shown: "mg", group: "other" },
  { key: "cholesterol", label: "Cholesterol", shown: "mg", group: "other" },
];

export function empty_nutrients(): Nutrients {
  return Object.fromEntries(nutrient_keys.map((key) => [key, 0])) as Nutrients;
}

// Anything that is not a finite number counts as 0.
export function normalize_nutrients(raw: unknown): Nutrients {
  const source = (raw ?? {}) as Record<string, unknown>;
  const result = empty_nutrients();
  for (const key of nutrient_keys) {
    const value = Number(source[key]);
    result[key] = Number.isFinite(value) ? value : 0;
  }
  return result;
}

export function scale_nutrients(values: Nutrients, factor: number): Nutrients {
  const result = empty_nutrients();
  for (const key of nutrient_keys) result[key] = values[key] * factor;
  return result;
}

export function add_nutrients(total: Nutrients, part: Nutrients): Nutrients {
  const result = empty_nutrients();
  for (const key of nutrient_keys) result[key] = total[key] + part[key];
  return result;
}

// The day's settings key for a nutrient's target, such as "diet.target_saturated_fat".
export function target_key(key: NutrientKey): string {
  return `diet.target_${key}`;
}

export interface TargetProgress {
  // Null when there is no target, which a target of 0 or less means.
  target: number | null;
  // How far along, 0 to 100 and no further.
  percent: number;
  over: boolean;
}

export function target_progress(value: number, target: number): TargetProgress {
  if (!(target > 0)) return { target: null, percent: 0, over: false };
  return { target, percent: Math.min(100, (value / target) * 100), over: value > target };
}

// ── Names ────────────────────────────────────────────────────────────────────

// Trimmed, de-duplicated without regard to case (the first spelling wins), and sorted.
export function normalize_names(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const by_lower = new Map<string, string>();
  for (const name of raw) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed && !by_lower.has(trimmed.toLowerCase())) by_lower.set(trimmed.toLowerCase(), trimmed);
  }
  return [...by_lower.values()].sort((first, second) => first.localeCompare(second));
}

// ── Categories ───────────────────────────────────────────────────────────────

// "Protein/Meat/Poultry" is Poultry inside Meat inside Protein; the path is the category's whole identity.
export const category_separator = "/";

export const uncategorized = "(uncategorized)";

export function normalize_category_name(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.split(category_separator).map((segment) => segment.trim()).filter(Boolean).join(category_separator);
}

// Sorted order also puts every parent straight before its children.
export function normalize_categories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return normalize_names(raw.map(normalize_category_name));
}

export function category_depth(name: string): number {
  return name.split(category_separator).length - 1;
}

export function category_leaf(name: string): string {
  return name.split(category_separator).at(-1) ?? name;
}

// "A/B/C" belongs to "A" and "A/B" too.
export function category_ancestors(name: string): string[] {
  const segments = name.split(category_separator);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join(category_separator));
}

export function is_in_category(tag: string, category: string): boolean {
  return tag === category || tag.startsWith(`${category}${category_separator}`);
}

// Every category named anywhere, with every parent its path implies.
export function all_categories(named: string[]): string[] {
  return normalize_categories(named.flatMap((name) => [name, ...category_ancestors(name)]));
}

// Renaming moves the subtree with it, and renaming onto an existing name merges the two.
export function rename_in_categories(categories: string[], from: string, to: string): string[] {
  return normalize_categories(categories.map((tag) => (is_in_category(tag, from) ? to + tag.slice(from.length) : tag)));
}

export function drop_from_categories(categories: string[], name: string): string[] {
  return categories.filter((tag) => !is_in_category(tag, name));
}

// ── Foods ────────────────────────────────────────────────────────────────────

// One more way to measure a food: `amount` of `unit` equals `size` of `size_unit`, which is the serving unit when empty.
export interface Portion {
  unit: string;
  amount: number;
  size: number;
  size_unit: string;
}

export interface Food {
  id: string;
  name: string;
  brand: string;
  comment: string;
  serving_size: number;
  serving_unit: string;
  portions: Portion[];
  categories: string[];
  // Per serving: serving_size of serving_unit.
  nutrients: Nutrients;
}

export interface Ingredient {
  food_id: string;
  amount: number;
  // A unit of the food; empty means the food's serving unit.
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  comment: string;
  servings: number;
  // What one serving is: a bowl, a slice.
  serving_unit: string;
  categories: string[];
  ingredients: Ingredient[];
}

export type EntryKind = "food" | "recipe";

export interface DiaryEntry {
  id: string;
  date: string;
  kind: EntryKind;
  ref_id: string;
  amount: number;
  // For a food, the unit the amount is in, "serving" when empty; for a recipe, always servings.
  unit: string;
  logged_at: string;
}

export interface GroceryItem {
  id: string;
  food_id: string;
  brand: string;
  amount: number;
  unit: string;
  comment: string;
  done: boolean;
}

// The whole serving, offered beside the food's own units.
export const serving_unit = "serving";

function positive(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function normalize_portion(raw: unknown): Portion {
  const portion = (raw ?? {}) as Record<string, unknown>;
  return { unit: text(portion.unit), amount: positive(portion.amount, 1), size: positive(portion.size, 1), size_unit: text(portion.size_unit) };
}

// One portion per unit, the last given winning.
export function normalize_portions(raw: unknown): Portion[] {
  if (!Array.isArray(raw)) return [];
  const by_unit = new Map<string, Portion>();
  for (const item of raw) {
    const portion = normalize_portion(item);
    if (portion.unit) by_unit.set(portion.unit.toLowerCase(), portion);
  }
  return [...by_unit.values()];
}

export function normalize_food(raw: unknown): Food {
  const food = (raw ?? {}) as Record<string, unknown>;
  const size = Number(food.serving_size);
  return {
    id: text(food.id),
    name: text(food.name),
    brand: text(food.brand),
    comment: text(food.comment),
    serving_size: Number.isFinite(size) && size > 0 ? size : 100,
    serving_unit: text(food.serving_unit) || "g",
    portions: normalize_portions(food.portions),
    categories: normalize_categories(food.categories),
    nutrients: normalize_nutrients(food.nutrients),
  };
}

export function normalize_recipe(raw: unknown): Recipe {
  const recipe = (raw ?? {}) as Record<string, unknown>;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  return {
    id: text(recipe.id),
    name: text(recipe.name),
    comment: text(recipe.comment),
    servings: positive(recipe.servings, 1),
    serving_unit: text(recipe.serving_unit) || serving_unit,
    categories: normalize_categories(recipe.categories),
    ingredients: ingredients.map((item) => {
      const ingredient = (item ?? {}) as Record<string, unknown>;
      return { food_id: text(ingredient.food_id), amount: positive(ingredient.amount, 1), unit: text(ingredient.unit) };
    }),
  };
}

// "Oats" or "Oats (Quaker)", so two versions of one food stay apart wherever it is picked by name.
export function food_label(item: { name: string; brand?: string }): string {
  return item.brand ? `${item.name} (${item.brand})` : item.name;
}

// Each portion's size in the serving unit, following chains such as tray → box → egg; a loop or an unknown unit is left out.
function resolve_portion_sizes(food: Food): Map<string, number> {
  const sizes = new Map<string, number>([[food.serving_unit, 1], [serving_unit, food.serving_size]]);
  const by_unit = new Map(food.portions.map((portion) => [portion.unit, portion]));

  const resolve = (unit: string, visiting: Set<string>): number | null => {
    const known = sizes.get(unit);
    if (known !== undefined) return known;
    const portion = by_unit.get(unit);
    if (!portion || visiting.has(unit)) return null;
    visiting.add(unit);
    const base = resolve(portion.size_unit || food.serving_unit, visiting);
    visiting.delete(unit);
    if (base === null) return null;
    const size = (portion.size / portion.amount) * base;
    sizes.set(unit, size);
    return size;
  };

  const resolved = new Map<string, number>();
  for (const portion of food.portions) {
    if (!portion.unit || portion.unit === serving_unit || portion.unit === food.serving_unit) continue;
    const size = resolve(portion.unit, new Set());
    if (size !== null) resolved.set(portion.unit, size);
  }
  return resolved;
}

export interface FoodUnit {
  unit: string;
  // How much of the serving unit one of this unit is.
  size: number;
}

// The whole serving, the serving unit, then each portion that resolves.
export function food_units(food: Food): FoodUnit[] {
  const units: FoodUnit[] = [{ unit: serving_unit, size: food.serving_size }];
  if (food.serving_unit !== serving_unit) units.push({ unit: food.serving_unit, size: 1 });
  for (const [unit, size] of resolve_portion_sizes(food)) units.push({ unit, size });
  return units;
}

// The portions that cannot be worked out in the serving unit: a loop, or a unit that is not defined.
export function food_unit_problems(food: Food): string[] {
  const resolved = resolve_portion_sizes(food);
  return food.portions
    .filter((portion) => portion.unit && portion.unit !== serving_unit && portion.unit !== food.serving_unit)
    .filter((portion) => !resolved.has(portion.unit))
    .map((portion) => portion.unit);
}

function unit_size(food: Food, unit: string): number | undefined {
  return food_units(food).find((entry) => entry.unit === unit)?.size;
}

// The factor on the food's stored nutrients for an amount of a unit; an unknown or empty unit falls back to fallback_unit.
export function servings_for(food: Food, amount: number, unit: string, fallback_unit: string): number {
  const size = (unit ? unit_size(food, unit) : undefined) ?? unit_size(food, fallback_unit) ?? 1;
  return (amount * size) / food.serving_size;
}

// ── Sums ─────────────────────────────────────────────────────────────────────

export type FoodsById = Record<string, Food>;
export type RecipesById = Record<string, Recipe>;

// Worked out from the current ingredients every time; a deleted food adds nothing.
export function recipe_nutrients_per_serving(recipe: Recipe, foods: FoodsById): Nutrients {
  let total = empty_nutrients();
  for (const ingredient of recipe.ingredients) {
    const food = foods[ingredient.food_id];
    if (!food) continue;
    total = add_nutrients(total, scale_nutrients(food.nutrients, servings_for(food, ingredient.amount, ingredient.unit, food.serving_unit)));
  }
  return scale_nutrients(total, 1 / recipe.servings);
}

export function entry_nutrients(entry: Pick<DiaryEntry, "kind" | "ref_id" | "amount" | "unit">, foods: FoodsById, recipes: RecipesById): Nutrients {
  if (entry.kind === "food") {
    const food = foods[entry.ref_id];
    return food ? scale_nutrients(food.nutrients, servings_for(food, entry.amount, entry.unit, serving_unit)) : empty_nutrients();
  }
  const recipe = recipes[entry.ref_id];
  return recipe ? scale_nutrients(recipe_nutrients_per_serving(recipe, foods), entry.amount) : empty_nutrients();
}

export function day_totals(entries: DiaryEntry[], foods: FoodsById, recipes: RecipesById): Nutrients {
  return entries.reduce((total, entry) => add_nutrients(total, entry_nutrients(entry, foods, recipes)), empty_nutrients());
}

export function by_id<Item extends { id: string }>(items: Item[]): Record<string, Item> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

// ── Usage ────────────────────────────────────────────────────────────────────

interface Usage {
  foods: number;
  recipes: number;
}

// Items carrying the category itself, or anything in its subtree too.
export function category_usage(foods: Food[], recipes: Recipe[], name: string, with_nested = false): Usage {
  const matches = (categories: string[]) => (with_nested ? categories.some((tag) => is_in_category(tag, name)) : categories.includes(name));
  return { foods: foods.filter((food) => matches(food.categories)).length, recipes: recipes.filter((recipe) => matches(recipe.categories)).length };
}

export function unit_usage(foods: Food[], recipes: Recipe[], grocery: GroceryItem[], unit: string): Usage & { grocery: number } {
  return {
    foods: foods.filter((food) => food.serving_unit === unit).length,
    recipes: recipes.filter((recipe) => recipe.serving_unit === unit).length,
    grocery: grocery.filter((item) => item.unit === unit).length,
  };
}
