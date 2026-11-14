// The units every section shows its measures in, read once from the settings, and the conversions and text the sections
// share: weights and lengths to a tenth with their unit, and changes with their sign.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_change, format_number, to_shown, type DistanceUnit, type EnergyUnit, type LengthUnit, type MassUnit, type Unit } from "@x-tech-laboratories/x-libs/units";

// ── Units ────────────────────────────────────────────────────────────────────

export interface ShownUnits {
  mass: MassUnit;
  length: LengthUnit;
  distance: DistanceUnit;
  energy: EnergyUnit;
}

export function shown_units(settings: Record<string, unknown>): ShownUnits {
  return {
    mass: settings.mass_unit === "lb" ? "lb" : "kg",
    length: settings.length_unit === "in" ? "in" : "cm",
    distance: settings.distance_unit === "mi" ? "mi" : "km",
    energy: settings.energy_unit === "kJ" ? "kJ" : "kcal",
  };
}

// ── Conversions ──────────────────────────────────────────────────────────────

// A stored measure in the unit shown, rounded to the tenth readings are taken to.
export function to_shown_tenth(value: number, unit: Unit): number {
  return Math.round(to_shown(value, unit) * 10) / 10;
}

// ── Text ─────────────────────────────────────────────────────────────────────

// A stored weight with its unit, such as "80.5 kg".
export function format_mass(kg: number, units: ShownUnits): string {
  return `${format_number(to_shown(kg, units.mass))} ${units.mass}`;
}

// A stored length with its unit, such as "32 in".
export function format_length(cm: number, units: ShownUnits): string {
  return `${format_number(to_shown(cm, units.length))} ${units.length}`;
}

// A stored change of weight with its sign and unit, such as "-0.5 kg".
export function format_mass_change(kg: number, units: ShownUnits): string {
  return format_change(to_shown(kg, units.mass), units.mass);
}
