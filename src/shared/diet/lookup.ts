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

// Every value is per 100 g in grams, and energy in kcal; the first field a product has wins, and a nutrient missing here is
// one Open Food Facts does not give, alcohol among them since it is kept in % vol.
const off_nutriment_keys: Partial<Record<NutrientKey, string | string[]>> = {
  calories: "energy-kcal_100g",
  protein: "proteins_100g",
  carbs: "carbohydrates_100g",
  fat: "fat_100g",
  fiber: "fiber_100g",
  sugar: "sugars_100g",
  saturated_fat: "saturated-fat_100g",
  sodium: "sodium_100g",
  cholesterol: "cholesterol_100g",
  vitamin_a: "vitamin-a_100g",
  vitamin_c: "vitamin-c_100g",
  vitamin_d: "vitamin-d_100g",
  vitamin_e: "vitamin-e_100g",
  vitamin_k: "vitamin-k_100g",
  thiamin: "vitamin-b1_100g",
  riboflavin: "vitamin-b2_100g",
  niacin: "vitamin-pp_100g",
  pantothenic_acid: "pantothenic-acid_100g",
  vitamin_b6: "vitamin-b6_100g",
  // Folates in all, or folic acid where a product gives no more.
  folate: ["folates_100g", "vitamin-b9_100g"],
  vitamin_b12: "vitamin-b12_100g",
  choline: "choline_100g",
  calcium: "calcium_100g",
  iron: "iron_100g",
  magnesium: "magnesium_100g",
  phosphorus: "phosphorus_100g",
  potassium: "potassium_100g",
  zinc: "zinc_100g",
  copper: "copper_100g",
  manganese: "manganese_100g",
  selenium: "selenium_100g",
  iodine: "iodine_100g",
  added_sugars: "added-sugars_100g",
  starch: "starch_100g",
  sugar_alcohols: "polyols_100g",
  trans_fat: "trans-fat_100g",
  monounsaturated_fat: "monounsaturated-fat_100g",
  polyunsaturated_fat: "polyunsaturated-fat_100g",
  omega_3: "omega-3-fat_100g",
  omega_6: "omega-6-fat_100g",
  biotin: "biotin_100g",
  beta_carotene: "beta-carotene_100g",
  chromium: "chromium_100g",
  molybdenum: "molybdenum_100g",
  chloride: "chloride_100g",
  fluoride: "fluoride_100g",
  caffeine: "caffeine_100g",
  water: "water_100g",
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
      for (const [key, fields] of Object.entries(off_nutriment_keys)) {
        const field = [fields].flat().find((name) => nutriments[name] !== undefined);
        if (field) nutrients[key as NutrientKey] = finite(nutriments[field]);
      }
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

// Nutrient numbers and the unit FoodData Central reports them in when a result does not say. Each inner list is one part,
// the first number a result reports winning, and the parts add up, as omega-3 is ALA, EPA, DHA and DPA together. A
// nutrient missing here is one FoodData Central does not give.
const usda_nutrient_numbers: Partial<Record<NutrientKey, [parts: string[][], unit: string]>> = {
  // Energy as reported, or by the specific then the general Atwater factors.
  calories: [[["208", "958", "957"]], "KCAL"],
  protein: [[["203"]], "G"],
  carbs: [[["205"]], "G"],
  fat: [[["204"]], "G"],
  fiber: [[["291"]], "G"],
  sugar: [[["269", "269.3"]], "G"],
  saturated_fat: [[["606"]], "G"],
  sodium: [[["307"]], "MG"],
  cholesterol: [[["601"]], "MG"],
  vitamin_a: [[["320"]], "UG"],
  vitamin_c: [[["401"]], "MG"],
  vitamin_d: [[["328"]], "UG"],
  vitamin_e: [[["323"]], "MG"],
  vitamin_k: [[["430"]], "UG"],
  thiamin: [[["404"]], "MG"],
  riboflavin: [[["405"]], "MG"],
  niacin: [[["406"]], "MG"],
  pantothenic_acid: [[["410"]], "MG"],
  vitamin_b6: [[["415"]], "MG"],
  // Folate as dietary folate equivalents, or the total where a food has no DFE figure.
  folate: [[["435", "417"]], "UG"],
  vitamin_b12: [[["418"]], "UG"],
  choline: [[["421"]], "MG"],
  calcium: [[["301"]], "MG"],
  iron: [[["303"]], "MG"],
  magnesium: [[["304"]], "MG"],
  phosphorus: [[["305"]], "MG"],
  potassium: [[["306"]], "MG"],
  zinc: [[["309"]], "MG"],
  copper: [[["312"]], "MG"],
  manganese: [[["315"]], "MG"],
  selenium: [[["317"]], "UG"],
  iodine: [[["314"]], "UG"],
  added_sugars: [[["539"]], "G"],
  starch: [[["209"]], "G"],
  sugar_alcohols: [[["299"]], "G"],
  trans_fat: [[["605"]], "G"],
  monounsaturated_fat: [[["645"]], "G"],
  polyunsaturated_fat: [[["646"]], "G"],
  omega_3: [[["851", "619"], ["629"], ["621"], ["631"]], "G"],
  omega_6: [[["675", "618"], ["855", "620"]], "G"],
  biotin: [[["416"]], "UG"],
  beta_carotene: [[["321"]], "UG"],
  lycopene: [[["337"]], "UG"],
  lutein_zeaxanthin: [[["338"]], "UG"],
  fluoride: [[["313"]], "UG"],
  chromium: [[["310"]], "UG"],
  molybdenum: [[["316"]], "UG"],
  chloride: [[["302"]], "MG"],
  tryptophan: [[["501"]], "G"],
  threonine: [[["502"]], "G"],
  isoleucine: [[["503"]], "G"],
  leucine: [[["504"]], "G"],
  lysine: [[["505"]], "G"],
  methionine: [[["506"]], "G"],
  cystine: [[["507"]], "G"],
  phenylalanine: [[["508"]], "G"],
  tyrosine: [[["509"]], "G"],
  valine: [[["510"]], "G"],
  arginine: [[["511"]], "G"],
  histidine: [[["512"]], "G"],
  alanine: [[["513"]], "G"],
  aspartic_acid: [[["514"]], "G"],
  glutamic_acid: [[["515"]], "G"],
  glycine: [[["516"]], "G"],
  proline: [[["517"]], "G"],
  serine: [[["518"]], "G"],
  alcohol: [[["221"]], "G"],
  caffeine: [[["262"]], "MG"],
  water: [[["255"]], "G"],
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
      for (const [key, [parts, default_unit]] of Object.entries(usda_nutrient_numbers)) {
        for (const numbers of parts) {
          const match = numbers.map((number) => reported.find((nutrient) => String(nutrient.nutrientNumber) === number)).find(Boolean);
          if (!match) continue;
          const unit = typeof match.unitName === "string" ? match.unitName.toUpperCase() : default_unit;
          nutrients[key as NutrientKey] += finite(match.value) * (grams_per_unit[unit] ?? grams_per_unit[default_unit]!);
        }
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
