// Food lookup by name in Open Food Facts, which needs no key, and USDA FoodData Central, which needs the user's key.
// Both give nutrition per 100 g, read here into the store's units: kcal and grams.

// ── Imports ──────────────────────────────────────────────────────────────────

import { empty_nutrients, type NutrientKey, type Nutrients } from "./model.ts";

// ── Results ──────────────────────────────────────────────────────────────────

export type LookupSource = "Open Food Facts" | "USDA";

export interface LookupResult {
  source: LookupSource;
  // Unique across both sources.
  key: string;
  name: string;
  brand: string;
  serving_size: number;
  serving_unit: string;
  nutrients: Nutrients;
}

export interface LookupReply {
  results: LookupResult[];
  // One line per source that failed; the other source's results still show.
  errors: string[];
  // Whether USDA was asked, which needs a key set in Settings.
  searched_usda: boolean;
}

type Fetch = typeof fetch;

const page_size = 15;
const timeout_in_milliseconds = 20_000;

async function fetch_json(fetcher: Fetch, url: string, service: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(timeout_in_milliseconds) });
  } catch {
    // The request's own error may name the address, which for USDA holds the key.
    throw new Error(`${service} could not be reached.`);
  }
  if (!response.ok) throw new Error(`${service} request failed: ${response.status} ${response.statusText}`.trim());
  return response.json();
}

function finite(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

// ── Open Food Facts ──────────────────────────────────────────────────────────

// Every value is per 100 g in grams, and energy in kcal.
const off_nutriment_keys: Record<NutrientKey, string> = {
  calories: "energy-kcal_100g",
  protein: "proteins_100g",
  carbs: "carbohydrates_100g",
  fat: "fat_100g",
  fiber: "fiber_100g",
  sugar: "sugars_100g",
  saturated_fat: "saturated-fat_100g",
  sodium: "sodium_100g",
  cholesterol: "cholesterol_100g",
};

export function open_food_facts_url(query: string): string {
  return `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${page_size}&fields=code,product_name,brands,nutriments`;
}

export function parse_open_food_facts(body: unknown): LookupResult[] {
  const products = ((body ?? {}) as { products?: unknown }).products;
  if (!Array.isArray(products)) return [];
  return products
    .map((product) => (product ?? {}) as Record<string, unknown>)
    .filter((product) => typeof product.product_name === "string" && product.product_name.trim())
    .map((product) => {
      const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
      const nutrients = empty_nutrients();
      for (const [key, field] of Object.entries(off_nutriment_keys)) nutrients[key as NutrientKey] = finite(nutriments[field]);
      return {
        source: "Open Food Facts" as const,
        key: `off-${String(product.code ?? product.product_name)}`,
        name: String(product.product_name).trim(),
        brand: typeof product.brands === "string" ? (product.brands.split(",")[0] ?? "").trim() : "",
        serving_size: 100,
        serving_unit: "g",
        nutrients,
      };
    });
}

export async function search_open_food_facts(query: string, fetcher: Fetch = fetch): Promise<LookupResult[]> {
  return parse_open_food_facts(await fetch_json(fetcher, open_food_facts_url(query), "Open Food Facts"));
}

// ── USDA FoodData Central ────────────────────────────────────────────────────

// Nutrient numbers, with the unit FoodData Central reports each in when a result does not say.
const usda_nutrient_numbers: Record<NutrientKey, [number: string, unit: string]> = {
  calories: ["208", "KCAL"],
  protein: ["203", "G"],
  carbs: ["205", "G"],
  fat: ["204", "G"],
  fiber: ["291", "G"],
  sugar: ["269", "G"],
  saturated_fat: ["606", "G"],
  sodium: ["307", "MG"],
  cholesterol: ["601", "MG"],
};

const grams_per_unit: Record<string, number> = { G: 1, MG: 0.001, UG: 0.000001, KCAL: 1 };

export function usda_url(api_key: string, query: string): string {
  return `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(api_key)}&query=${encodeURIComponent(query)}&pageSize=${page_size}&dataType=Foundation,SR%20Legacy,Branded`;
}

export function parse_usda(body: unknown): LookupResult[] {
  const foods = ((body ?? {}) as { foods?: unknown }).foods;
  if (!Array.isArray(foods)) return [];
  return foods
    .map((food) => (food ?? {}) as Record<string, unknown>)
    .filter((food) => typeof food.description === "string" && food.description.trim())
    .map((food) => {
      const reported = (Array.isArray(food.foodNutrients) ? food.foodNutrients : []) as Record<string, unknown>[];
      const nutrients = empty_nutrients();
      for (const [key, [number, default_unit]] of Object.entries(usda_nutrient_numbers)) {
        const match = reported.find((nutrient) => String(nutrient.nutrientNumber) === number);
        if (!match) continue;
        const unit = typeof match.unitName === "string" ? match.unitName.toUpperCase() : default_unit;
        nutrients[key as NutrientKey] = finite(match.value) * (grams_per_unit[unit] ?? grams_per_unit[default_unit]!);
      }
      const brand = [food.brandName, food.brandOwner].find((value) => typeof value === "string" && value.trim());
      return {
        source: "USDA" as const,
        key: `usda-${String(food.fdcId ?? food.description)}`,
        name: String(food.description).trim(),
        brand: typeof brand === "string" ? brand.trim() : "",
        serving_size: 100,
        serving_unit: "g",
        nutrients,
      };
    });
}

export async function search_usda(api_key: string, query: string, fetcher: Fetch = fetch): Promise<LookupResult[]> {
  return parse_usda(await fetch_json(fetcher, usda_url(api_key, query), "USDA FoodData Central"));
}

// ── Both ─────────────────────────────────────────────────────────────────────

// Asks both at once and merges what came back, so one failing source never hides the other's results.
export async function search_foods(query: string, usda_api_key: string, fetcher: Fetch = fetch): Promise<LookupReply> {
  const trimmed = query.trim();
  const searched_usda = usda_api_key.trim() !== "";
  if (!trimmed) return { results: [], errors: [], searched_usda };
  const [off, usda] = await Promise.allSettled([
    search_open_food_facts(trimmed, fetcher),
    searched_usda ? search_usda(usda_api_key.trim(), trimmed, fetcher) : Promise.resolve([]),
  ]);
  const settled = [off, usda];
  return {
    results: settled.flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value : [])),
    errors: settled.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)] : [])),
    searched_usda,
  };
}
