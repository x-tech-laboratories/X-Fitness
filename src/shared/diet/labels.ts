// The nutrition-label presets: which nutrients each country's label lists, which the page shows by default, and each
// region's reference amounts, which the day's targets start from. Plain data, so the store and the page share it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { nutrients, target_key, type NutrientInfo, type NutrientKey } from "./model.ts";

// ── Labels ───────────────────────────────────────────────────────────────────

export interface LabelPreset {
  id: string;
  label: string;
  // Ids from model.ts's nutrients, so salt can stand in for sodium.
  shown: string[];
}

export const label_presets: LabelPreset[] = [
  {
    id: "us",
    label: "US Nutrition Facts",
    shown: ["calories", "fat", "saturated_fat", "trans_fat", "cholesterol", "sodium", "carbs", "fiber", "sugar", "added_sugars", "protein", "vitamin_d", "calcium", "iron", "potassium"],
  },
  { id: "eu", label: "EU and UK nutrition declaration", shown: ["calories", "fat", "saturated_fat", "carbs", "sugar", "protein", "salt"] },
  {
    id: "ca",
    label: "Canadian Nutrition Facts",
    shown: ["calories", "fat", "saturated_fat", "trans_fat", "carbs", "fiber", "sugar", "protein", "cholesterol", "sodium", "potassium", "calcium", "iron"],
  },
  { id: "anz", label: "Australia and New Zealand nutrition information panel", shown: ["calories", "protein", "fat", "saturated_fat", "carbs", "sugar", "sodium"] },
  // Salt is left out, since sodium already shows it.
  { id: "all", label: "Everything", shown: nutrients.filter((info) => info.id !== "salt").map((info) => info.id) },
];

function preset_of<Preset extends { id: string }>(presets: Preset[], raw: unknown): Preset {
  return presets.find((preset) => preset.id === raw) ?? presets[0]!;
}

export function label_preset_of(settings: Record<string, unknown>): LabelPreset {
  return preset_of(label_presets, settings["diet.label"]);
}

// The nutrients switched on or off by hand, by id, laid over the label's own.
export function shown_overrides(settings: Record<string, unknown>): Record<string, boolean> {
  const raw = settings["diet.shown"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([id, on]) => typeof on === "boolean" && nutrients.some((info) => info.id === id)));
}

export function is_shown(settings: Record<string, unknown>, info: NutrientInfo): boolean {
  return shown_overrides(settings)[info.id] ?? label_preset_of(settings).shown.includes(info.id);
}

// The nutrients the page shows, in model.ts's order.
export function shown_nutrients(settings: Record<string, unknown>): NutrientInfo[] {
  return nutrients.filter((info) => is_shown(settings, info));
}

// The overrides after one switch: a switch back to what the label shows drops the override instead of keeping it.
export function with_shown(settings: Record<string, unknown>, info: NutrientInfo, on: boolean): Record<string, boolean> {
  const { [info.id]: _, ...rest } = shown_overrides(settings);
  return label_preset_of(settings).shown.includes(info.id) === on ? rest : { ...rest, [info.id]: on };
}

// ── Targets ──────────────────────────────────────────────────────────────────

export interface TargetPreset {
  id: string;
  label: string;
  // Energy in kcal and the rest in grams; a nutrient missing has no target.
  targets: Partial<Record<NutrientKey, number>>;
}

// The vitamins and minerals the US and Canada share.
const north_american_micronutrients: Partial<Record<NutrientKey, number>> = {
  vitamin_a: 0.0009,
  vitamin_c: 0.09,
  vitamin_d: 0.00002,
  vitamin_e: 0.015,
  vitamin_k: 0.00012,
  thiamin: 0.0012,
  riboflavin: 0.0013,
  niacin: 0.016,
  pantothenic_acid: 0.005,
  vitamin_b6: 0.0017,
  biotin: 0.00003,
  folate: 0.0004,
  vitamin_b12: 0.0000024,
  choline: 0.55,
  calcium: 1.3,
  iron: 0.018,
  magnesium: 0.42,
  phosphorus: 1.25,
  zinc: 0.011,
  copper: 0.0009,
  manganese: 0.0023,
  selenium: 0.000055,
  iodine: 0.00015,
  chromium: 0.000035,
  molybdenum: 0.000045,
  chloride: 2.3,
};

export const target_presets: TargetPreset[] = [
  {
    id: "us",
    label: "US Daily Values",
    targets: {
      ...north_american_micronutrients,
      calories: 2000,
      protein: 50,
      carbs: 275,
      fat: 78,
      fiber: 28,
      added_sugars: 50,
      saturated_fat: 20,
      cholesterol: 0.3,
      sodium: 2.3,
      potassium: 4.7,
    },
  },
  {
    id: "eu",
    label: "EU Reference Intakes",
    targets: {
      calories: 2000,
      protein: 50,
      carbs: 260,
      fat: 70,
      sugar: 90,
      saturated_fat: 20,
      // 6 g of salt.
      sodium: 2.4,
      vitamin_a: 0.0008,
      vitamin_c: 0.08,
      vitamin_d: 0.000005,
      vitamin_e: 0.012,
      vitamin_k: 0.000075,
      thiamin: 0.0011,
      riboflavin: 0.0014,
      niacin: 0.016,
      pantothenic_acid: 0.006,
      vitamin_b6: 0.0014,
      biotin: 0.00005,
      folate: 0.0002,
      vitamin_b12: 0.0000025,
      potassium: 2,
      chloride: 0.8,
      calcium: 0.8,
      phosphorus: 0.7,
      magnesium: 0.375,
      iron: 0.014,
      zinc: 0.01,
      copper: 0.001,
      manganese: 0.002,
      fluoride: 0.0035,
      selenium: 0.000055,
      chromium: 0.00004,
      molybdenum: 0.00005,
      iodine: 0.00015,
    },
  },
  {
    id: "ca",
    label: "Canadian Daily Values",
    targets: {
      ...north_american_micronutrients,
      calories: 2000,
      fat: 75,
      saturated_fat: 20,
      fiber: 28,
      sugar: 100,
      cholesterol: 0.3,
      sodium: 2.3,
      potassium: 3.4,
    },
  },
  {
    id: "anz",
    label: "Australia and New Zealand Daily Intakes",
    targets: {
      // 8700 kJ.
      calories: 8700 / 4.184,
      protein: 50,
      carbs: 310,
      fat: 70,
      fiber: 30,
      sugar: 90,
      saturated_fat: 24,
      sodium: 2.3,
      vitamin_a: 0.00075,
      vitamin_c: 0.04,
      vitamin_d: 0.00001,
      vitamin_e: 0.01,
      thiamin: 0.0011,
      riboflavin: 0.0017,
      niacin: 0.01,
      vitamin_b6: 0.0016,
      folate: 0.0002,
      vitamin_b12: 0.000002,
      calcium: 0.8,
      iodine: 0.00015,
      iron: 0.012,
      magnesium: 0.32,
      phosphorus: 1,
      selenium: 0.00007,
      zinc: 0.012,
      // Estimated safe and adequate daily intakes, which Schedule 1 gives where it has no RDI.
      vitamin_k: 0.00008,
      pantothenic_acid: 0.005,
      biotin: 0.00003,
      copper: 0.003,
      manganese: 0.005,
      chromium: 0.0002,
      molybdenum: 0.00025,
    },
  },
];

export function target_preset_of(settings: Record<string, unknown>): TargetPreset {
  return preset_of(target_presets, settings["diet.targets"]);
}

export function preset_target(settings: Record<string, unknown>, key: NutrientKey): number {
  return target_preset_of(settings).targets[key] ?? 0;
}

// The target set by hand, or null when the nutrient follows the preset.
export function target_override(settings: Record<string, unknown>, key: NutrientKey): number | null {
  const raw = settings[target_key(key)];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

// The day's target for a nutrient, 0 meaning none.
export function target_of(settings: Record<string, unknown>, key: NutrientKey): number {
  return target_override(settings, key) ?? preset_target(settings, key);
}
