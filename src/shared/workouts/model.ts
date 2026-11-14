// What workouts are made of: how an exercise is measured, the plan of programs, sessions and their exercises, logged
// workouts with their sets, and the sums every report is built from.

// ── Measurements ─────────────────────────────────────────────────────────────

export type Measurement = "weight" | "bodyweight" | "duration" | "cardio";

export type SetField = "reps" | "weight" | "duration" | "distance";

// How an exercise is measured decides the fields its sets carry; the others stay 0.
export const measurements: { key: Measurement; label: string; fields: SetField[] }[] = [
  { key: "weight", label: "Weight & Reps", fields: ["reps", "weight"] },
  { key: "bodyweight", label: "Bodyweight Reps", fields: ["reps"] },
  { key: "duration", label: "Duration", fields: ["duration"] },
  { key: "cardio", label: "Cardio", fields: ["duration", "distance"] },
];

export function measurement_of(measurement: string | undefined): (typeof measurements)[number] {
  return measurements.find((item) => item.key === measurement) ?? measurements[0]!;
}

export function is_measurement(value: unknown): value is Measurement {
  return measurements.some((item) => item.key === value);
}

// ── Records ──────────────────────────────────────────────────────────────────

// Weight in kg, duration in seconds and distance in km, whatever the units shown.
export interface SetValues {
  reps: number;
  weight: number;
  duration: number;
  distance: number;
}

export interface LoggedSet extends SetValues {
  id: string;
  rpe: number;
}

export interface Exercise {
  id: string;
  name: string;
  measurement: Measurement;
  equipment: string;
  muscles: string[];
  categories: string[];
  notes: string;
}

export type ProgressionType = "none" | "linear" | "double" | "sum";

// Every parameter is kept whatever the type, so switching type and back loses nothing; an absolute step is in kg.
export interface Progression {
  type: ProgressionType;
  increment: number;
  increment_percent: boolean;
  successes: number;
  success_counter: number;
  decrement: number;
  decrement_percent: boolean;
  failures: number;
  failure_counter: number;
  min_reps: number;
  max_reps: number;
  reps_threshold: number;
}

// What one session prescribes for one exercise: how many sets, the targets each aims at, and the rest between them.
export interface SessionEntry extends SetValues {
  id: string;
  exercise_id: string;
  sets: number;
  rest: number;
  notes: string;
  progression: Progression;
}

export interface Session {
  id: string;
  program_id: string;
  name: string;
  notes: string;
  categories: string[];
  entries: SessionEntry[];
}

export interface Program {
  id: string;
  name: string;
  notes: string;
  sessions: Session[];
}

// What a workout entry was prescribed when the workout started; all 0 for one added by hand.
export interface Target extends SetValues {
  sets: number;
  rest: number;
}

export interface WorkoutEntry {
  id: string;
  exercise_id: string;
  session_entry_id: string;
  target: Target;
  notes: string;
  sets: LoggedSet[];
}

export interface Workout {
  id: string;
  // The local day it was logged on, such as "2026-11-10".
  date: string;
  name: string;
  // Empty for a workout that came from no session.
  session_id: string;
  started_at: string;
  // Set once finished, which is what stops progression running twice.
  finished_at: string;
  notes: string;
  entries: WorkoutEntry[];
}

// Everything an import brings, already in stored units, merged in by id.
// Categories as "/" paths, here and on each exercise and session.
export interface WorkoutsDocument {
  categories: string[];
  exercises: Exercise[];
  programs: Program[];
  workouts: Workout[];
}

// ── Progressions ─────────────────────────────────────────────────────────────

export type ProgressionField = "increment" | "successes" | "decrement" | "failures" | "min_reps" | "max_reps" | "reps_threshold";

export const progressions: { key: ProgressionType; label: string; fields: ProgressionField[] }[] = [
  { key: "none", label: "None", fields: [] },
  { key: "linear", label: "Linear", fields: ["increment", "successes", "decrement", "failures"] },
  { key: "double", label: "Double", fields: ["increment", "min_reps", "max_reps"] },
  { key: "sum", label: "Sum of Reps", fields: ["reps_threshold", "increment"] },
];

// How each parameter is labelled; a weight step names the flag that makes it a percentage.
export const progression_fields: Record<ProgressionField, { label: string; step: number; percent_key?: "increment_percent" | "decrement_percent" }> = {
  increment: { label: "Increase by", step: 0.5, percent_key: "increment_percent" },
  successes: { label: "After successes", step: 1 },
  decrement: { label: "Decrease by", step: 0.5, percent_key: "decrement_percent" },
  failures: { label: "After failures", step: 1 },
  min_reps: { label: "Min reps", step: 1 },
  max_reps: { label: "Max reps", step: 1 },
  reps_threshold: { label: "Total reps", step: 1 },
};

// Filled into parameters still at 0 when a type is picked, so the form opens on a workable progression.
export const progression_defaults: Record<ProgressionType, Partial<Progression>> = {
  none: {},
  linear: { increment: 2.5 },
  double: { increment: 2.5, min_reps: 6, max_reps: 10 },
  sum: { reps_threshold: 30, increment: 2.5 },
};

export function normalize_progression(raw: Partial<Progression> | undefined): Progression {
  return {
    type: progressions.some((item) => item.key === raw?.type) ? raw!.type! : "none",
    increment: non_negative(raw?.increment),
    increment_percent: raw?.increment_percent === true,
    successes: positive(raw?.successes, 1),
    success_counter: non_negative(raw?.success_counter),
    decrement: non_negative(raw?.decrement),
    decrement_percent: raw?.decrement_percent === true,
    failures: positive(raw?.failures, 1),
    failure_counter: non_negative(raw?.failure_counter),
    min_reps: non_negative(raw?.min_reps),
    max_reps: non_negative(raw?.max_reps),
    reps_threshold: non_negative(raw?.reps_threshold),
  };
}

// Every progression moves weight, so only a weight-and-reps exercise can have one.
export function is_progressable(exercise: Pick<Exercise, "measurement"> | undefined): boolean {
  return exercise?.measurement === "weight";
}

// ── Numbers and names ────────────────────────────────────────────────────────

export function positive(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function non_negative(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function trimmed(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// Free-text names such as muscles: trimmed, alike ignoring case kept once, sorted.
export function normalize_names(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const by_lower = new Map<string, string>();
  for (const name of raw) {
    const text = trimmed(name);
    if (text && !by_lower.has(text.toLowerCase())) by_lower.set(text.toLowerCase(), text);
  }
  return [...by_lower.values()].sort((first, second) => first.localeCompare(second));
}

// ── Sums ─────────────────────────────────────────────────────────────────────

// Weight moved, which only means something for a weight-and-reps exercise.
export function set_volume(set: SetValues, measurement: Measurement | undefined): number {
  return measurement === "weight" ? set.reps * set.weight : 0;
}

// Epley: the load a set of reps at a weight projects to for one rep.
export function estimated_one_rep_max(set: SetValues): number {
  if (!set.reps || !set.weight) return 0;
  return set.weight * (1 + set.reps / 30);
}

export interface WorkoutTotals {
  sets: number;
  volume: number;
  reps: number;
  duration: number;
  distance: number;
}

export function workout_totals(workout: Pick<Workout, "entries">, measurement_by_exercise: Map<string, Measurement>): WorkoutTotals {
  const totals = { sets: 0, volume: 0, reps: 0, duration: 0, distance: 0 };
  for (const entry of workout.entries) {
    const measurement = measurement_by_exercise.get(entry.exercise_id);
    for (const set of entry.sets) {
      totals.sets += 1;
      totals.reps += set.reps;
      totals.duration += set.duration;
      totals.distance += set.distance;
      totals.volume += set_volume(set, measurement);
    }
  }
  return totals;
}
