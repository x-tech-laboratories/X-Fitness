// Calculators: BMI, body fat, lean mass and daily energy worked out from the latest body readings, the diary and settings,
// the daily targets a plan gives, written once or kept following it into the diet's targets, and the training numbers
// from the workout log: one-rep maxes, strength scores, heart zones, runs and workout energy.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_local } from "@x-tech-laboratories/x-libs/dates";
import { between, eq } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { shift_day, skinfold_of, type BodyMetric, type MetricRole, type Point } from "../body/readings.ts";
import { body_metrics } from "../body/schema.ts";
import { body_setting_defaults } from "../body/settings.ts";
import { latest_on_or_before, list_metrics, metric_series, weight_metric } from "../body/store.ts";
import { target_of } from "../diet/labels.ts";
import { target_key, type NutrientKey } from "../diet/model.ts";
import { diet_setting_defaults } from "../diet/settings.ts";
import { diet_feature } from "../diet/store.ts";
import { define_feature, drizzle_of } from "../feature.ts";
import type { Exercise, Measurement, Workout } from "../workouts/model.ts";
import { workouts } from "../workouts/schema.ts";
import { load_exercises, load_workouts } from "../workouts/store.ts";
import { calculators_api } from "./api.ts";
import {
  activity_of,
  age_on,
  bmr_formula_of,
  calculate,
  change_per_day,
  diet_goal_keys,
  goal_progress,
  measured_energy,
  plan_goals,
  round_to,
  sex_of,
  weight_at_bmi,
  weight_at_body_fat,
  type Calculations,
  type GoalProgress,
  type MeasuredEnergy,
  type GoalKey,
  type GoalPlan,
  type Measures,
  type PlannedGoal,
} from "./formulas.ts";
import { calculators_setting_defaults } from "./settings.ts";
import {
  bar_and_plates,
  karvonen_zones,
  max_heart_rate,
  one_rep_maxes,
  race_distances,
  riegel_time,
  running_met,
  strength_scores,
  vdot,
  vo2max_from_heart,
  workout_calories,
  type StrengthScores,
} from "./training.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

// The metric a measure comes from and its latest reading on or before the day.
export interface MeasureSource {
  metric: BodyMetric;
  reading: Point | null;
}

// A daily target from the plan beside the one in force now.
export interface CalculatedGoal extends PlannedGoal {
  // The target in force now, null when there is none.
  current: number | null;
}

export interface CalculationsReport {
  date: string;
  birth_date: string;
  measures: Measures;
  // By measure, such as weight, height, body_fat, waist or skinfold_thigh; each metric's goal is the body goal.
  sources: Record<string, MeasureSource>;
  calculations: Calculations;
  plan: GoalPlan;
  // The diet's daily targets from the plan.
  goals: CalculatedGoal[];
  // Whether the diet's targets follow the plan after every change.
  following_diet: boolean;
  // The energy burned a day by the diary and the weight trend, null without enough of either.
  measured: MeasuredEnergy | null;
  measured_days: number;
  energy_source: "formula" | "measured";
  // Kilograms a week by the weight readings over the measured days, null without two a week apart.
  weight_trend: number | null;
  // The weight against its goal, and the weeks left at the trend's and the plan's pace.
  progress: GoalProgress | null;
}

// A lift's best set over the last weeks, by its one-rep max with the reps in reserve counted.
export interface LiftBest {
  exercise_id: string;
  name: string;
  date: string;
  weight: number;
  reps: number;
  rpe: number;
  one_rep_max: number;
}

export interface RunBest {
  date: string;
  distance: number;
  duration: number;
  vdot: number;
}

export interface WorkoutEnergy {
  workout_id: string;
  date: string;
  name: string;
  seconds: number;
  // Null without a weight reading on or before the day.
  calories: number | null;
}

export type BigLift = "squat" | "bench" | "deadlift";

export interface TrainingReport {
  date: string;
  body_weight: number;
  lifts: LiftBest[];
  // The exercise each powerlift is read from, "" when none fits.
  big_three: Record<BigLift, string>;
  total: number | null;
  scores: StrengthScores | null;
  heart: { resting: number | null; maximum: number | null; zones: { label: string; low: number; high: number }[] | null; vo2max: number | null };
  cardio_exercises: { id: string; name: string }[];
  running: { exercise_id: string; best: RunBest | null; predictions: { label: string; distance: number; seconds: number }[] };
  workouts: WorkoutEnergy[];
  // In kg, the mass unit's own when not set.
  plates: { bar: number; plates: number[] };
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
    const fits = metric.role === "body_fat" ? metric.kind === "percent" : metric.role === "resting_heart_rate" ? metric.kind === "custom" : metric.kind === "length";
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
    height: latest("height"),
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
  const window_days = Math.max(7, number_setting(database, "calculators.measured_days") || 28);
  const weights = sources.weight ? metric_series(database, sources.weight.metric.id).filter((point) => point.date > shift_day(date, -window_days) && point.date <= date) : [];
  // Today is still being eaten, so the diary is read up to yesterday.
  const intake = diet_feature.methods
    .list_daily_totals(database, shift_day(date, -window_days), shift_day(date, -1))
    .map((day) => ({ date: day.date, calories: day.totals.calories, entries: day.entries }));
  const measured = measured_energy(intake, weights);
  const energy_source = setting_of(database, "calculators.energy_source") === "measured" ? "measured" : "formula";
  const measured_tdee = energy_source === "measured" ? (measured?.tdee ?? null) : null;
  const goals = plan_goals(measures, calculations, plan, measured_tdee).map((goal) => with_current(database, goal));
  const following_diet = setting_of(database, "calculators.follow_diet_targets") === true;
  const trend = change_per_day(weights);
  const weight_trend = trend === null ? null : trend * 7;
  const progress = goal_progress(measures.weight, sources.weight?.metric.goal ?? 0, weight_trend, plan.weekly_change);
  return { date, birth_date, measures, sources, calculations, plan, goals, following_diet, measured, measured_days: window_days, energy_source, weight_trend, progress };
}

// ── Training ─────────────────────────────────────────────────────────────────

const lift_days = 90;

// Names that mark each powerlift, and the variations that are not it.
const big_lift_names: Record<BigLift, [RegExp, RegExp]> = {
  squat: [/squat/i, /front|goblet|split|hack|box|overhead|jump|sissy|pistol|bulgarian/i],
  bench: [/bench press/i, /incline|decline|close|dumbbell|floor/i],
  deadlift: [/deadlift/i, /romanian|stiff|rdl|trap|hex|deficit|single/i],
};

function guess_exercise(chosen: unknown, candidates: { id: string; name: string }[], pattern: RegExp, unlike?: RegExp): string {
  if (typeof chosen === "string" && candidates.some((candidate) => candidate.id === chosen)) return chosen;
  return candidates.find((candidate) => pattern.test(candidate.name) && !unlike?.test(candidate.name))?.id ?? "";
}

// The sets with something done, each with its day and exercise.
function done_sets(workout_list: Workout[]) {
  return workout_list.flatMap((workout) =>
    workout.entries.flatMap((entry) => entry.sets.filter((set) => set.reps > 0 || set.duration > 0).map((set) => ({ date: workout.date, exercise_id: entry.exercise_id, set }))),
  );
}

function best_lifts(workout_list: Workout[], exercises: Exercise[]): LiftBest[] {
  const lifted = new Map(exercises.filter((exercise) => exercise.measurement === "weight").map((exercise) => [exercise.id, exercise.name]));
  const best = new Map<string, LiftBest>();
  for (const { date, exercise_id, set } of done_sets(workout_list)) {
    const name = lifted.get(exercise_id);
    const estimate = one_rep_maxes({ weight: set.weight, reps: set.reps, rpe: set.rpe })?.epley;
    if (name === undefined || estimate === undefined) continue;
    if ((best.get(exercise_id)?.one_rep_max ?? 0) < estimate) best.set(exercise_id, { exercise_id, name, date, weight: set.weight, reps: set.reps, rpe: set.rpe, one_rep_max: estimate });
  }
  return [...best.values()].sort((first, second) => first.name.localeCompare(second.name));
}

function best_run(workout_list: Workout[], exercise_id: string): RunBest | null {
  let best: RunBest | null = null;
  for (const { date, set } of done_sets(workout_list).filter((item) => item.exercise_id === exercise_id)) {
    const value = vdot(set.distance, set.duration);
    if (value !== null && (best === null || value > best.vdot)) best = { date, distance: set.distance, duration: set.duration, vdot: value };
  }
  return best;
}

const met_settings: Record<Measurement, string> = {
  weight: "calculators.met_weight",
  bodyweight: "calculators.met_bodyweight",
  duration: "calculators.met_duration",
  cardio: "calculators.met_cardio",
};

// A set of reps is taken as two minutes with its rest.
const seconds_a_set = 120;

// How long each exercise took and at what MET, scaled to the workout's own start and finish when both are known.
function workout_energy(database: SqlDatabase, workout: Workout, exercises: Map<string, Exercise>, running_id: string): WorkoutEnergy {
  const parts = workout.entries.map((entry) => {
    const measurement = exercises.get(entry.exercise_id)?.measurement ?? "weight";
    const sets = entry.sets.filter((set) => set.reps > 0 || set.duration > 0);
    const timed = measurement === "duration" || measurement === "cardio";
    const seconds = timed ? sets.reduce((sum, set) => sum + set.duration, 0) : sets.length * seconds_a_set;
    const distance = sets.reduce((sum, set) => sum + set.distance, 0);
    const met = (entry.exercise_id === running_id ? running_met(distance, seconds) : null) ?? number_setting(database, met_settings[measurement]);
    return { seconds, met };
  });
  const counted = parts.reduce((sum, part) => sum + part.seconds, 0);
  const lasted = (Date.parse(workout.finished_at) - Date.parse(workout.started_at)) / 1000;
  const scale = Number.isFinite(lasted) && lasted > 0 && lasted < 6 * 3600 && counted > 0 ? lasted / counted : 1;
  const weight = latest_on_or_before(database, weight_metric(list_metrics(database))?.id ?? "", workout.date)?.value ?? 0;
  const calories = parts.reduce<number | null>((sum, part) => {
    const burned = workout_calories(part.met, weight, part.seconds * scale);
    return burned === null ? sum : (sum ?? 0) + burned;
  }, null);
  return { workout_id: workout.id, date: workout.date, name: workout.name, seconds: counted * scale, calories: weight > 0 ? calories : null };
}

function running_exercise(database: SqlDatabase, exercises: Exercise[]): string {
  const cardio = exercises.filter((exercise) => exercise.measurement === "cardio");
  return guess_exercise(setting_of(database, "calculators.running_exercise"), cardio, /\b(run|running|jog|jogging)\b/i);
}

function list_workout_energy(database: SqlDatabase, from: string, to: string): WorkoutEnergy[] {
  const exercises = load_exercises(database);
  const by_id = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const running_id = running_exercise(database, exercises);
  return load_workouts(database, between(workouts.date, from, to)).map((workout) => workout_energy(database, workout, by_id, running_id));
}

function plates_of(database: SqlDatabase): { bar: number; plates: number[] } {
  return bar_and_plates(setting_of(database, "mass_unit"), setting_of(database, "calculators.bar_weight"), setting_of(database, "calculators.plates"));
}

function training_report(database: SqlDatabase, date: string): TrainingReport {
  const body = report(database, date);
  const exercises = load_exercises(database);
  const recent = load_workouts(database, between(workouts.date, shift_day(date, -(lift_days - 1)), date));
  const lifts = best_lifts(recent, exercises);
  const is_logged = (id: string) => (lifts.some((lift) => lift.exercise_id === id) ? 0 : 1);
  const lifted = exercises.filter((exercise) => exercise.measurement === "weight").sort((first, second) => is_logged(first.id) - is_logged(second.id));
  const pick = (lift: BigLift) => guess_exercise(setting_of(database, `calculators.${lift}_exercise`), lifted, ...big_lift_names[lift]);
  const big_three: Record<BigLift, string> = { squat: pick("squat"), bench: pick("bench"), deadlift: pick("deadlift") };
  const maxes = Object.values(big_three).map((id) => lifts.find((lift) => lift.exercise_id === id)?.one_rep_max ?? 0);
  const total = maxes.every((value) => value > 0) ? maxes.reduce((sum, value) => sum + value, 0) : null;
  const resting = body.sources.resting_heart_rate?.reading?.value ?? null;
  const maximum = max_heart_rate(body.measures.age);
  const running_id = running_exercise(database, exercises);
  const best = running_id ? best_run(recent, running_id) : null;
  const by_id = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return {
    date,
    body_weight: body.measures.weight,
    lifts,
    big_three,
    total,
    scores: total === null ? null : strength_scores(total, body.measures.weight, body.measures.sex),
    heart: {
      resting,
      maximum,
      zones: resting !== null && maximum !== null ? karvonen_zones(resting, maximum) : null,
      vo2max: resting !== null && maximum !== null ? vo2max_from_heart(maximum, resting) : null,
    },
    cardio_exercises: exercises.filter((exercise) => exercise.measurement === "cardio").map(({ id, name }) => ({ id, name })),
    running: {
      exercise_id: running_id,
      best,
      predictions: best ? race_distances.map((race) => ({ ...race, seconds: riegel_time(best.distance, best.duration, race.distance) ?? 0 })) : [],
    },
    workouts: recent
      .filter((workout) => workout.date > shift_day(date, -30))
      .reverse()
      .map((workout) => workout_energy(database, workout, by_id, running_id)),
    plates: plates_of(database),
  };
}

// The target in force, the preset's when none was set by hand or by the plan.
function with_current(database: SqlDatabase, goal: PlannedGoal): CalculatedGoal {
  const key = goal.key as NutrientKey;
  const current = target_of({ "diet.targets": setting_of(database, "diet.targets"), [target_key(key)]: setting_of(database, target_key(key)) }, key);
  return { ...goal, current: current > 0 ? current : null };
}

// ── Writing ──────────────────────────────────────────────────────────────────

// Sets each daily target named that has a value, leaving those already equal; gives how many changed.
function apply_goals(database: SqlDatabase, keys: GoalKey[], date: string): number {
  let changed = 0;
  for (const goal of report(database, date).goals) {
    if (!keys.includes(goal.key) || goal.value === null) continue;
    if (goal.current !== null && Math.abs(goal.current - goal.value) < 1e-6) continue;
    database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(`diet.target_${goal.key}`, JSON.stringify(goal.value));
    changed += 1;
  }
  return changed;
}

function today_here(): string {
  return format_local(new Date(), false);
}

// After every change, the diet's targets are brought up to date with the plan while they follow it.
function follow_plan(database: SqlDatabase): void {
  if (setting_of(database, "calculators.follow_diet_targets") === true) apply_goals(database, diet_goal_keys, today_here());
}

// ── Carrying over ────────────────────────────────────────────────────────────

// The plan's body targets as they were once stored as settings, before the goals became the metrics' own.
const old_body_plan = { body_fat: "calculators.goal_body_fat", bmi: "calculators.goal_bmi", waist_to_height: "calculators.goal_waist_to_height", follow: "calculators.follow_body_goals" };

// Writes the goals an old stored body plan gave into the weight, body fat and waist metrics that have none, then drops
// the old settings, so it does its work once and running it again changes nothing.
export function carry_over_body_goals(database: SqlDatabase): void {
  const stored = new Map(
    (database.prepare(`SELECT key, value FROM settings WHERE key IN (${Object.values(old_body_plan).map(() => "?").join(", ")})`).all(...Object.values(old_body_plan)) as { key: string; value: string }[]).map((row) => [
      row.key,
      Number(JSON.parse(row.value)),
    ]),
  );
  if (stored.size === 0) return;
  const old = (key: string, fallback: number) => (Number.isFinite(stored.get(key)) ? stored.get(key)! : fallback);
  const body_fat = old(old_body_plan.body_fat, 0);
  const bmi = old(old_body_plan.bmi, 22);
  const waist_to_height = old(old_body_plan.waist_to_height, 0.5);
  const { measures, calculations, sources } = report(database, today_here());
  const lean = calculations.composition?.lean_mass ?? 0;
  const weight = (body_fat > 0 ? weight_at_body_fat(lean, body_fat) : null) ?? weight_at_bmi(bmi, measures.height);
  const goals: Record<string, number | null> = {
    weight: weight === null ? null : round_to(weight, 0.1),
    body_fat: body_fat > 0 ? body_fat : null,
    waist: waist_to_height > 0 && measures.height > 0 ? round_to(waist_to_height * measures.height, 0.1) : null,
  };
  in_transaction(database, () => {
    for (const [measure, goal] of Object.entries(goals)) {
      const metric = sources[measure]?.metric;
      if (goal === null || !metric || metric.goal > 0) continue;
      drizzle_of(database).update(body_metrics).set({ goal }).where(eq(body_metrics.id, metric.id)).run();
    }
    for (const key of stored.keys()) database.prepare("DELETE FROM settings WHERE key = ?").run(key);
  });
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

    get_training_calculations: (database: SqlDatabase, today: string): TrainingReport => training_report(database, check_day(today)),

    // The energy each workout in the days given burned, oldest first.
    list_workout_energy: (database: SqlDatabase, from: string, to: string): WorkoutEnergy[] => list_workout_energy(database, check_day(from), check_day(to)),
  },
  api: calculators_api,
  setting_defaults: calculators_setting_defaults,
  after_write: follow_plan,
  on_open: carry_over_body_goals,
});
