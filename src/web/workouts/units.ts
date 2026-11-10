// Numbers as the Workouts section shows them: weights and distances in the units chosen under Settings, durations in
// minutes, whole numbers whole and anything else to one decimal.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_clock } from "@x-tech-laboratories/x-libs/durations";
import { to_shown, to_stored, type DistanceUnit, type MassUnit } from "@x-tech-laboratories/x-libs/units";

import type { SetField } from "../../shared/workouts/model.ts";

// ── Units ────────────────────────────────────────────────────────────────────

export interface ShownUnits {
  mass: MassUnit;
  distance: DistanceUnit;
}

export function units_of(settings: Record<string, unknown>): ShownUnits {
  return { mass: settings.mass_unit === "lb" ? "lb" : "kg", distance: settings.distance_unit === "mi" ? "mi" : "km" };
}

// Trailing zeroes read as false precision, so whole numbers print whole and the rest keep one decimal.
export function format_number(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// A set field's stored value as typed and shown: weight and distance converted, duration in minutes.
export function field_to_shown(field: SetField, value: number, units: ShownUnits): number {
  if (field === "weight") return Math.round(to_shown(value, units.mass) * 100) / 100;
  if (field === "distance") return Math.round(to_shown(value, units.distance) * 100) / 100;
  if (field === "duration") return Math.round((value / 60) * 100) / 100;
  return value;
}

export function field_to_stored(field: SetField, value: number, units: ShownUnits): number {
  if (field === "weight") return to_stored(value, units.mass);
  if (field === "distance") return to_stored(value, units.distance);
  if (field === "duration") return value * 60;
  return value;
}

export function field_unit(field: SetField, units: ShownUnits): string {
  if (field === "weight") return units.mass;
  if (field === "distance") return units.distance;
  if (field === "duration") return "min";
  return "reps";
}

export const field_labels: Record<SetField, string> = { reps: "Reps", weight: "Weight", duration: "Duration", distance: "Distance" };

// A stored value with its unit, such as "135 lb" or "12.5 min".
export function format_field(field: SetField, value: number, units: ShownUnits): string {
  return `${format_number(field_to_shown(field, value, units))} ${field_unit(field, units)}`;
}

export function format_weight(kg: number, units: ShownUnits): string {
  return format_field("weight", kg, units);
}

// Seconds as a clock such as "1:30".
export function format_rest(seconds: number): string {
  return format_clock(seconds * 1000);
}
