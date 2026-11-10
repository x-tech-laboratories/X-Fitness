// A metric's numbers as the page shows them: weights and lengths in the units from settings, percent and custom units
// as kept, to a tenth.

// ── Imports ──────────────────────────────────────────────────────────────────

import { to_shown, to_stored, type LengthUnit, type MassUnit } from "@x-tech-laboratories/x-libs/units";

import type { BodyMetric } from "../../shared/body/readings.ts";

// ── Units ────────────────────────────────────────────────────────────────────

export interface ShownUnits {
  mass: MassUnit;
  length: LengthUnit;
}

export function shown_units(settings: Record<string, unknown>): ShownUnits {
  return { mass: settings.mass_unit === "lb" ? "lb" : "kg", length: settings.length_unit === "in" ? "in" : "cm" };
}

type Measured = Pick<BodyMetric, "kind" | "unit">;

// The label beside a metric's numbers, such as "kg", "%" or "bpm".
export function unit_of(metric: Measured, units: ShownUnits): string {
  if (metric.kind === "weight") return units.mass;
  if (metric.kind === "length") return units.length;
  if (metric.kind === "percent") return "%";
  return metric.unit;
}

// Readings are taken to a tenth, so a stored value is shown rounded to one.
export function to_shown_value(metric: Measured, value: number, units: ShownUnits): number {
  const shown = metric.kind === "weight" || metric.kind === "length" ? to_shown(value, unit_of(metric, units) as MassUnit | LengthUnit) : value;
  return Math.round(shown * 10) / 10;
}

export function to_stored_value(metric: Measured, value: number, units: ShownUnits): number {
  return metric.kind === "weight" || metric.kind === "length" ? to_stored(value, unit_of(metric, units) as MassUnit | LengthUnit) : value;
}

// ── Text ─────────────────────────────────────────────────────────────────────

// Whole numbers print whole and the rest keep one decimal.
export function format_number(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function format_value(metric: Measured, value: number, units: ShownUnits): string {
  return `${format_number(to_shown_value(metric, value, units))} ${unit_of(metric, units)}`.trim();
}

// A difference with its sign, such as "+1.5 kg"; converting a difference needs no offset, so it goes as a value does.
export function format_change(metric: Measured, change: number, units: ShownUnits): string {
  const shown = metric.kind === "weight" || metric.kind === "length" ? to_shown(change, unit_of(metric, units) as MassUnit | LengthUnit) : change;
  const text = format_number(shown);
  return `${shown > 0 && text !== "0" ? "+" : ""}${text} ${unit_of(metric, units)}`.trim();
}
