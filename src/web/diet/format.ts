// How the Diet section shows its numbers: energy in the unit chosen in Settings, sodium and cholesterol in mg, the rest in
// grams, and a failed call as a toast.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_measure, to_shown, to_stored, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import type { NutrientInfo } from "../../shared/diet/model.ts";

// ── Units ────────────────────────────────────────────────────────────────────

export function energy_unit_of(settings: Record<string, unknown>): EnergyUnit {
  return settings.energy_unit === "kJ" ? "kJ" : "kcal";
}

export function shown_unit(info: NutrientInfo, energy: EnergyUnit): string {
  return info.shown === "energy" ? energy : info.shown;
}

export function to_shown_value(info: NutrientInfo, stored: number, energy: EnergyUnit): number {
  if (info.shown === "energy") return to_shown(stored, energy);
  return info.shown === "mg" ? stored * 1000 : stored;
}

export function to_stored_value(info: NutrientInfo, shown: number, energy: EnergyUnit): number {
  if (info.shown === "energy") return to_stored(shown, energy);
  return info.shown === "mg" ? shown / 1000 : shown;
}

// Grams to one decimal, energy and mg as whole numbers.
export function format_nutrient(info: NutrientInfo, stored: number, energy: EnergyUnit): string {
  if (info.shown === "energy") return format_measure(stored, energy, 0);
  const decimals = info.shown === "mg" ? 0 : 1;
  const shown = Number(to_shown_value(info, stored, energy).toFixed(decimals));
  return `${shown.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${info.shown}`;
}

// Short enough for a field, with the float noise of a unit change rounded off.
export function field_value(value: number): number {
  return Number(value.toFixed(4));
}

export function format_amount(value: number): string {
  return String(Number(value.toFixed(2)));
}

// ── Calls ────────────────────────────────────────────────────────────────────

export function error_text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Runs a call and shows its failure as a toast, giving undefined back then.
export async function attempt<Result>(work: () => Promise<Result>, done?: string): Promise<Result | undefined> {
  try {
    const result = await work();
    if (done) toast(done, { tone: "good" });
    return result;
  } catch (error) {
    toast(error_text(error), { tone: "bad" });
    return undefined;
  }
}

// Whether a call that answers nothing went through, its failure shown as a toast.
export async function succeeds(work: () => Promise<unknown>, done?: string): Promise<boolean> {
  try {
    await work();
    if (done) toast(done, { tone: "good" });
    return true;
  } catch (error) {
    toast(error_text(error), { tone: "bad" });
    return false;
  }
}
