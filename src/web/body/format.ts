// A metric's numbers as the page shows them: weights and lengths in the units from settings, skinfolds in mm, percent
// and custom units as kept, to a tenth.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_change as format_signed, format_number, to_shown, to_stored, type LengthUnit, type MassUnit } from "@x-tech-laboratories/x-libs/units";

import { skinfold_of, type BodyMetric, type MetricRole } from "../../shared/body/readings.ts";
import { to_shown_tenth, type ShownUnits } from "../units.ts";

// ── Units ────────────────────────────────────────────────────────────────────

type Measured = Pick<BodyMetric, "kind" | "unit"> & { role?: MetricRole };

// A weight, a length and a skinfold, for numbers that are not a metric's own, such as the calculators' fields.
export const body_measures = {
  weight: { kind: "weight", unit: "" },
  length: { kind: "length", unit: "" },
  skinfold: { kind: "length", unit: "", role: "skinfold_chest" },
} as const satisfies Record<string, Measured>;

// Calipers read skinfolds in millimetres, whatever the length unit.
function is_skinfold(metric: Measured): boolean {
  return metric.kind === "length" && metric.role !== undefined && skinfold_of(metric.role) !== null;
}

// The label beside a metric's numbers, such as "kg", "%" or "bpm".
export function unit_of(metric: Measured, units: ShownUnits): string {
  if (is_skinfold(metric)) return "mm";
  if (metric.kind === "weight") return units.mass;
  if (metric.kind === "length") return units.length;
  if (metric.kind === "percent") return "%";
  return metric.unit;
}

// Readings are taken to a tenth, so a stored value is shown rounded to one.
export function to_shown_value(metric: Measured, value: number, units: ShownUnits): number {
  if (is_skinfold(metric)) return Math.round(value * 100) / 10;
  if (metric.kind === "weight" || metric.kind === "length") return to_shown_tenth(value, unit_of(metric, units) as MassUnit | LengthUnit);
  return Math.round(value * 10) / 10;
}

export function to_stored_value(metric: Measured, value: number, units: ShownUnits): number {
  if (is_skinfold(metric)) return value / 10;
  return metric.kind === "weight" || metric.kind === "length" ? to_stored(value, unit_of(metric, units) as MassUnit | LengthUnit) : value;
}

// ── Text ─────────────────────────────────────────────────────────────────────

export function format_value(metric: Measured, value: number, units: ShownUnits): string {
  return `${format_number(to_shown_value(metric, value, units))} ${unit_of(metric, units)}`.trim();
}

// A difference with its sign, such as "+1.5 kg"; converting a difference needs no offset, so it goes as a value does.
export function format_change(metric: Measured, change: number, units: ShownUnits): string {
  const shown = is_skinfold(metric) ? change * 10 : metric.kind === "weight" || metric.kind === "length" ? to_shown(change, unit_of(metric, units) as MassUnit | LengthUnit) : change;
  return format_signed(shown, unit_of(metric, units));
}
