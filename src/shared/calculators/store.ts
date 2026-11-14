// Calculators: BMI, body fat, lean mass and daily energy worked out from the latest body readings and settings, and the
// goals a plan gives, written once or kept following it into the body metrics' goals and the diet's targets.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_local } from "@x-tech-laboratories/x-libs/dates";
import { eq } from "@x-tech-laboratories/x-libs/drizzle";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { skinfold_of, type BodyMetric, type MetricRole, type Point } from "../body/readings.ts";
import { body_metrics } from "../body/schema.ts";
import { body_setting_defaults } from "../body/settings.ts";
import { latest_on_or_before, list_metrics, weight_metric } from "../body/store.ts";
import { diet_setting_defaults } from "../diet/settings.ts";
import { define_feature, drizzle_of } from "../feature.ts";
import { calculators_api } from "./api.ts";
import {
  activity_of,
  age_on,
  body_goal_keys,
  bmr_formula_of,
  calculate,
  diet_goal_keys,
  plan_goals,
  sex_of,
  type Calculations,
  type GoalKey,
  type GoalPlan,
  type Measures,
  type PlannedGoal,
} from "./formulas.ts";
import { calculators_setting_defaults } from "./settings.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

// The metric a measure comes from and its latest reading on or before the day.
export interface MeasureSource {
  metric: BodyMetric;
  reading: Point | null;
}

// A goal from the plan beside the one set now, and where it is kept.
export interface CalculatedGoal extends PlannedGoal {
  // The goal or target set now, null when there is none.
  current: number | null;
  // The metric whose goal it is, or "diet" for a diet target; null when there is no metric to hold it.
  holder: { metric_id: string; metric_name: string } | "diet" | null;
}

export interface CalculationsReport {
  date: string;
  birth_date: string;
  measures: Measures;
  // By measure, such as weight, body_fat, waist or skinfold_thigh.
  sources: Record<string, MeasureSource>;
  calculations: Calculations;
  plan: GoalPlan;
  goals: CalculatedGoal[];
  following: { body: boolean; diet: boolean };
}

// ── Reading ──────────────────────────────────────────────────────────────────

const defaults: Record<string, unknown> = { ...body_setting_defaults, ...diet_setting_defaults, ...calculators_setting_defaults };

function setting_of(database: SqlDatabase, key: string): unknown {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : defaults[key];
}

function number_setting(database: SqlDatabase, key: string): number {
  const value = Number(setting_of(database, key));
  return Number.isFinite(value) ? value : 0;
}

function plan_of(database: SqlDatabase): GoalPlan {
  return {
    body_fat: number_setting(database, "calculators.goal_body_fat"),
    bmi: number_setting(database, "calculators.goal_bmi"),
    waist_to_height: number_setting(database, "calculators.goal_waist_to_height"),
    weekly_change: number_setting(database, "calculators.weekly_change"),
    protein_per_kg: number_setting(database, "calculators.protein_per_kg"),
    fat_percent: number_setting(database, "calculators.fat_percent"),
  };
}

// The metric standing for each measure: the first weight, and the first metric with each role.
function metric_sources(metrics: BodyMetric[]): Record<string, BodyMetric> {
  const sources: Record<string, BodyMetric> = {};
  const weight = weight_metric(metrics);
  if (weight) sources.weight = weight;
  for (const metric of metrics) {
    const fits = metric.role === "body_fat" ? metric.kind === "percent" : metric.kind === "length";
    if (metric.role && fits && !sources[metric.role]) sources[metric.role] = metric;
  }
  return sources;
}

function report(database: SqlDatabase, date: string): CalculationsReport {
  const birth_date = String(setting_of(database, "body.birth_date") ?? "");
  const sources: Record<string, MeasureSource> = {};
  for (const [measure, metric] of Object.entries(metric_sources(list_metrics(database)))) {
    sources[measure] = { metric, reading: latest_on_or_before(database, metric.id, date) };
  }
  const latest = (measure: string) => sources[measure]?.reading?.value ?? 0;
  const measures: Measures = {
    sex: sex_of(setting_of(database, "body.sex")),
    age: age_on(birth_date, date),
    height: number_setting(database, "body.height"),
    weight: latest("weight"),
    body_fat: latest("body_fat"),
    neck: latest("neck"),
    waist: latest("waist"),
    hips: latest("hips"),
    skinfolds: {},
    activity: activity_of(setting_of(database, "calculators.activity")),
    bmr_formula: bmr_formula_of(setting_of(database, "calculators.bmr_formula")),
  };
  for (const [measure, source] of Object.entries(sources)) {
    const fold = skinfold_of(measure as MetricRole);
    if (fold && source.reading) measures.skinfolds[fold] = source.reading.value;
  }
  const calculations = calculate(measures);
  const plan = plan_of(database);
  const goals = plan_goals(measures, calculations, plan).map((goal) => with_holder(database, goal, sources));
  const following = { body: setting_of(database, "calculators.follow_body_goals") === true, diet: setting_of(database, "calculators.follow_diet_targets") === true };
  return { date, birth_date, measures, sources, calculations, plan, goals, following };
}

function with_holder(database: SqlDatabase, goal: PlannedGoal, sources: Record<string, MeasureSource>): CalculatedGoal {
  if (diet_goal_keys.includes(goal.key)) {
    const current = number_setting(database, `diet.target_${goal.key}`);
    return { ...goal, current: current > 0 ? current : null, holder: "diet" };
  }
  const metric = sources[goal.key]?.metric;
  if (!metric) return { ...goal, current: null, holder: null };
  return { ...goal, current: metric.goal > 0 ? metric.goal : null, holder: { metric_id: metric.id, metric_name: metric.name } };
}

// ── Writing ──────────────────────────────────────────────────────────────────

// Sets each goal named that has a value and somewhere to go, leaving those already equal; gives how many changed.
function apply_goals(database: SqlDatabase, keys: GoalKey[], date: string): number {
  let changed = 0;
  for (const goal of report(database, date).goals) {
    if (!keys.includes(goal.key) || goal.value === null || goal.holder === null) continue;
    if (goal.current !== null && Math.abs(goal.current - goal.value) < 1e-6) continue;
    if (goal.holder === "diet") {
      database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(`diet.target_${goal.key}`, JSON.stringify(goal.value));
    } else {
      drizzle_of(database).update(body_metrics).set({ goal: goal.value }).where(eq(body_metrics.id, goal.holder.metric_id)).run();
    }
    changed += 1;
  }
  return changed;
}

// After every change, the goals turned on to follow the plan are brought up to date with it.
function follow_plan(database: SqlDatabase): void {
  const keys = [
    ...(setting_of(database, "calculators.follow_body_goals") === true ? body_goal_keys : []),
    ...(setting_of(database, "calculators.follow_diet_targets") === true ? diet_goal_keys : []),
  ];
  if (keys.length > 0) apply_goals(database, keys, format_local(new Date(), false));
}

function check_day(date: unknown): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a day: ${String(date)}`);
  return date;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const calculators_feature = define_feature({
  id: "calculators",
  migrations: [],
  tables: [],
  methods: {
    get_calculations: (database: SqlDatabase, today: string): CalculationsReport => report(database, check_day(today)),

    apply_calculated_goals: (database: SqlDatabase, keys: GoalKey[], today: string): number => apply_goals(database, keys, check_day(today)),
  },
  api: calculators_api,
  setting_defaults: calculators_setting_defaults,
  after_write: follow_plan,
});
