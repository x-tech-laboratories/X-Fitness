// The rules behind body metrics that need no database: what a metric is, the days around a date, and the numbers a
// series of readings gives, such as its moving average and BMI.

// ── Imports ──────────────────────────────────────────────────────────────────

import { add_days, format_local, parse_local } from "@x-tech-laboratories/x-libs/dates";

import { skinfolds, type Skinfold } from "../calculators/formulas.ts";
import { shape_roles, type ShapeRole } from "./shape.ts";

// ── Metrics ──────────────────────────────────────────────────────────────────

// What a metric is measured in: weights in kg and lengths in cm, shown in the units from settings; percent and a custom
// unit as typed.
export type MetricKind = "weight" | "length" | "percent" | "custom";

export const metric_kinds: { key: MetricKind; label: string }[] = [
  { key: "weight", label: "Weight" },
  { key: "length", label: "Length" },
  { key: "percent", label: "Percent" },
  { key: "custom", label: "Custom Unit" },
];

export interface BodyMetric {
  id: string;
  name: string;
  kind: MetricKind;
  // The label of a custom metric, such as "bpm"; empty for the other kinds.
  unit: string;
  // In the stored unit; 0 means no goal.
  goal: number;
  comment: string;
  position: number;
  role: MetricRole;
}

export type MetricInput = Partial<Omit<BodyMetric, "position">>;

// ── Roles ────────────────────────────────────────────────────────────────────

// What a metric stands for: body fat or a girth, which also shape the 3D body, the height, a caliper skinfold, or the resting pulse.
export type MetricRole = ShapeRole | "height" | `skinfold_${Skinfold}` | "resting_heart_rate";

export const metric_roles: { key: MetricRole; label: string }[] = [
  ...shape_roles,
  { key: "height", label: "Height" },
  ...skinfolds.map((fold) => ({ key: `skinfold_${fold.key}` as const, label: `${fold.label} skinfold` })),
  { key: "resting_heart_rate", label: "Resting heart rate" },
];

export function metric_role_of(role: unknown): MetricRole {
  return metric_roles.find((candidate) => candidate.key === role)?.key ?? "";
}

// The skinfold a role is, or null for any other role.
export function skinfold_of(role: MetricRole): Skinfold | null {
  return role.startsWith("skinfold_") ? (role.slice("skinfold_".length) as Skinfold) : null;
}

export function kind_of(kind: unknown): MetricKind {
  return metric_kinds.find((candidate) => candidate.key === kind)?.key ?? "weight";
}

export function positive_number(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function trimmed_text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// A metric as saved: a name, a known kind and role, and a goal that is a positive number or 0.
export function normalize_metric(input: MetricInput): Omit<BodyMetric, "id" | "position"> {
  const kind = kind_of(input.kind);
  return {
    name: trimmed_text(input.name) || "Metric",
    kind,
    unit: kind === "custom" ? trimmed_text(input.unit) : "",
    goal: positive_number(input.goal),
    comment: trimmed_text(input.comment),
    role: metric_role_of(input.role),
  };
}

// ── Days ─────────────────────────────────────────────────────────────────────

export function is_day(date: unknown): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function shift_day(date: string, days: number): string {
  return format_local(add_days(parse_local(date), days), false);
}

// The first day a range of days ending today covers, or "" for all time.
export function range_start(today: string, days: number): string {
  return days > 0 ? shift_day(today, -(days - 1)) : "";
}

// ── Series ───────────────────────────────────────────────────────────────────

export interface Point {
  date: string;
  value: number;
}

export interface SeriesStats {
  first: Point;
  latest: Point;
  // The latest reading less the first.
  change: number;
  lowest: number;
  highest: number;
  count: number;
}

export const average_days = 7;

// Each reading's average over the readings in the days ending on it, so swings such as water weight smooth into a trend.
export function moving_average(series: Point[], days: number): Point[] {
  return series.map((point) => {
    const from = shift_day(point.date, -(days - 1));
    const window = series.filter((other) => other.date >= from && other.date <= point.date);
    return { date: point.date, value: window.reduce((sum, other) => sum + other.value, 0) / window.length };
  });
}

export function series_stats(series: Point[]): SeriesStats | null {
  const first = series[0];
  const latest = series.at(-1);
  if (!first || !latest) return null;
  const values = series.map((point) => point.value);
  return { first, latest, change: latest.value - first.value, lowest: Math.min(...values), highest: Math.max(...values), count: series.length };
}

// Body mass index from a weight in kg and a height in cm, or 0 when either is missing.
export function body_mass_index(weight: number, height: number): number {
  if (!(weight > 0) || !(height > 0)) return 0;
  const metres = height / 100;
  return weight / (metres * metres);
}
