// How the Diet section shows its numbers: energy in the unit chosen in Settings and each nutrient in its own g, mg or µg.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_grams, format_measure, from_grams, to_grams, to_shown, to_stored, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";

import type { NutrientInfo } from "../../shared/diet/model.ts";

// ── Units ────────────────────────────────────────────────────────────────────

export function shown_unit(info: NutrientInfo, energy: EnergyUnit): string {
  return info.shown === "energy" ? energy : info.shown;
}

export function to_shown_value(info: NutrientInfo, stored: number, energy: EnergyUnit): number {
  if (info.shown === "energy") return to_shown(stored, energy);
  return from_grams(stored * (info.scale ?? 1), info.shown);
}

export function to_stored_value(info: NutrientInfo, shown: number, energy: EnergyUnit): number {
  if (info.shown === "energy") return to_stored(shown, energy);
  return to_grams(shown, info.shown) / (info.scale ?? 1);
}

// Energy as a whole number, and grams, mg and µg as X-Libs' format_grams shows them.
export function format_nutrient(info: NutrientInfo, stored: number, energy: EnergyUnit): string {
  if (info.shown === "energy") return format_measure(stored, energy, 0);
  return format_grams(stored * (info.scale ?? 1), info.shown);
}

// Short enough for a field, with the float noise of a unit change rounded off.
export function field_value(value: number): number {
  return Number(value.toFixed(4));
}

export function format_amount(value: number): string {
  return String(Number(value.toFixed(2)));
}
