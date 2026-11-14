// The training formulas: one-rep maxes and strength scores from lifts, heart-rate zones, VO2max and race times from
// runs and the pulse, the plates on a bar, and the energy a workout burns. Plain functions on kg, km, seconds and kcal.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Sex } from "./formulas.ts";

// ── One-rep max ──────────────────────────────────────────────────────────────

export interface Lift {
  weight: number;
  reps: number;
  // 0 when not rated; reps left in reserve are 10 less it.
  rpe: number;
}

export type OneRepFormula = "epley" | "brzycki" | "lombardi";

export const one_rep_formulas: { key: OneRepFormula; label: string }[] = [
  { key: "epley", label: "Epley" },
  { key: "brzycki", label: "Brzycki" },
  { key: "lombardi", label: "Lombardi" },
];

// The reps the set was worth: those done and, with an RPE, those left in reserve.
export function effective_reps(lift: Lift): number {
  const reserve = lift.rpe >= 5 && lift.rpe <= 10 ? 10 - lift.rpe : 0;
  return lift.reps + reserve;
}

export function one_rep_maxes(lift: Lift): Record<OneRepFormula, number> | null {
  const reps = effective_reps(lift);
  if (!(lift.weight > 0) || !(lift.reps > 0)) return null;
  if (reps <= 1) return { epley: lift.weight, brzycki: lift.weight, lombardi: lift.weight };
  return {
    epley: lift.weight * (1 + reps / 30),
    brzycki: reps < 37 ? (lift.weight * 36) / (37 - reps) : lift.weight * (1 + reps / 30),
    lombardi: lift.weight * reps ** 0.1,
  };
}

// The weight and the reps it allows at each tenth of a one-rep max, by Epley worked backwards.
export function percent_table(one_rep_max: number): { percent: number; weight: number; reps: number }[] {
  return [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map((percent) => ({
    percent,
    weight: (one_rep_max * percent) / 100,
    reps: Math.max(1, Math.round(30 * (100 / percent - 1))),
  }));
}

// ── Strength scores ──────────────────────────────────────────────────────────

function polynomial(coefficients: number[], value: number): number {
  return coefficients.reduce((sum, coefficient, power) => sum + coefficient * value ** power, 0);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export interface StrengthScores {
  wilks: number;
  dots: number;
  ipf_gl: number;
}

// Wilks, DOTS and IPF GoodLift points for a powerlifting total in kg at a body weight in kg; a sex must be set.
export function strength_scores(total: number, body_weight: number, sex: Sex): StrengthScores | null {
  if (!sex || !(total > 0) || !(body_weight > 0)) return null;
  const male = sex === "male";
  const wilks_weight = male ? clamp(body_weight, 40, 201.9) : clamp(body_weight, 26.51, 154.53);
  const wilks = male
    ? [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8]
    : [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8];
  const dots_weight = male ? clamp(body_weight, 40, 210) : clamp(body_weight, 40, 150);
  const dots = male ? [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093] : [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706];
  const [a, b, c] = male ? [1199.72839, 1025.18162, 0.00921] : [610.32796, 1045.59282, 0.03048];
  return {
    wilks: (total * 500) / polynomial(wilks, wilks_weight),
    dots: (total * 500) / polynomial(dots, dots_weight),
    ipf_gl: (total * 100) / (a - b * Math.exp(-c * body_weight)),
  };
}

// ── Heart ────────────────────────────────────────────────────────────────────

// Tanaka's 208 less 0.7 a year, closer for adults than the older 220 less the age.
export function max_heart_rate(age: number): number | null {
  return age > 0 ? 208 - 0.7 * age : null;
}

export const heart_zones: { label: string; low: number; high: number }[] = [
  { label: "Zone 1: recovery", low: 0.5, high: 0.6 },
  { label: "Zone 2: endurance", low: 0.6, high: 0.7 },
  { label: "Zone 3: tempo", low: 0.7, high: 0.8 },
  { label: "Zone 4: threshold", low: 0.8, high: 0.9 },
  { label: "Zone 5: maximum", low: 0.9, high: 1 },
];

// Karvonen's zones: each a share of the reserve between the resting and the maximum pulse, on top of the resting.
export function karvonen_zones(resting: number, maximum: number): { label: string; low: number; high: number }[] | null {
  if (!(resting > 0) || !(maximum > resting)) return null;
  const reserve = maximum - resting;
  return heart_zones.map((zone) => ({ label: zone.label, low: resting + reserve * zone.low, high: resting + reserve * zone.high }));
}

// ── VO2max and races ─────────────────────────────────────────────────────────

// Uth's estimate from the maximum and resting pulse, in ml per kg a minute.
export function vo2max_from_heart(maximum: number, resting: number): number | null {
  return maximum > 0 && resting > 0 ? (15.3 * maximum) / resting : null;
}

// Cooper's test: the km run in twelve minutes.
export function vo2max_from_cooper(distance: number): number | null {
  return distance > 0.6 ? (distance * 1000 - 504.9) / 44.73 : null;
}

// Daniels and Gilbert's VDOT from a run's distance in km and time in seconds: the VO2max that run shows.
export function vdot(distance: number, duration: number): number | null {
  const minutes = duration / 60;
  if (!(distance >= 1) || !(minutes >= 3)) return null;
  const metres_a_minute = (distance * 1000) / minutes;
  const oxygen = -4.6 + 0.182258 * metres_a_minute + 0.000104 * metres_a_minute ** 2;
  const share = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
  const value = oxygen / share;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const race_distances: { label: string; distance: number }[] = [
  { label: "1 mile", distance: 1.609344 },
  { label: "5K", distance: 5 },
  { label: "10K", distance: 10 },
  { label: "Half marathon", distance: 21.0975 },
  { label: "Marathon", distance: 42.195 },
];

// Riegel's prediction: time grows a little faster than distance, by the power 1.06.
export function riegel_time(distance: number, duration: number, to_distance: number): number | null {
  return distance > 0 && duration > 0 && to_distance > 0 ? duration * (to_distance / distance) ** 1.06 : null;
}

// ── Plates ───────────────────────────────────────────────────────────────────

const kg_a_pound = 0.45359237;

// The bar and plates in kg from their settings, a 20 kg bar and metric plates or a 45 lb bar and pound plates when not set.
export function bar_and_plates(mass_unit: unknown, bar_setting: unknown, plates_setting: unknown): { bar: number; plates: number[] } {
  const pounds = mass_unit === "lb";
  const bar = Number(bar_setting);
  const chosen = Array.isArray(plates_setting) ? plates_setting.map(Number).filter((plate) => plate > 0) : [];
  return {
    bar: bar > 0 ? bar : pounds ? 45 * kg_a_pound : 20,
    plates: chosen.length ? chosen : pounds ? [45, 35, 25, 10, 5, 2.5].map((plate) => plate * kg_a_pound) : [25, 20, 15, 10, 5, 2.5, 1.25],
  };
}

export interface PlateLoad {
  // Each plate on one side, heaviest first, with how many.
  per_side: { plate: number; count: number }[];
  // What the bar and plates come to, short of the target by what no plates make up.
  loaded: number;
}

// The fewest plates each side that load a bar as near the target as they can without going over.
export function load_plates(target: number, bar: number, plates: number[]): PlateLoad | null {
  if (!(target > 0) || !(bar >= 0) || target < bar) return null;
  let remaining = (target - bar) / 2;
  const per_side: { plate: number; count: number }[] = [];
  for (const plate of [...new Set(plates.filter((plate) => plate > 0))].sort((first, second) => second - first)) {
    const count = Math.floor((remaining + 1e-6) / plate);
    if (count > 0) {
      per_side.push({ plate, count });
      remaining -= count * plate;
    }
  }
  const side = per_side.reduce((sum, item) => sum + item.plate * item.count, 0);
  return { per_side, loaded: bar + side * 2 };
}

// ── Workout energy ───────────────────────────────────────────────────────────

// Energy a workout burns: its MET (work as a multiple of resting) times the body weight and the hours.
export function workout_calories(met: number, weight: number, seconds: number): number | null {
  return met > 0 && weight > 0 && seconds > 0 ? (met * weight * seconds) / 3600 : null;
}

// The ACSM equations for walking and running: oxygen from the speed, as METs.
export function running_met(distance: number, duration: number): number | null {
  if (!(distance > 0) || !(duration > 0)) return null;
  const metres_a_minute = (distance * 1000) / (duration / 60);
  const per_metre = metres_a_minute < 134 ? 0.1 : 0.2;
  return (3.5 + per_metre * metres_a_minute) / 3.5;
}
