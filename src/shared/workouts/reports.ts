// What the log adds up to: each exercise's history, records and trend, the leaders among them, and totals per week.

// ── Imports ──────────────────────────────────────────────────────────────────

import { category_path, known_category_ids, type Category } from "../category_tree.ts";
import { estimated_one_rep_max, set_volume, workout_totals, type Exercise, type LoggedSet, type Measurement, type Workout } from "./model.ts";

// ── Days ─────────────────────────────────────────────────────────────────────

// A "YYYY-MM-DD" day moved by whole days, counted in UTC so no clock change can skip one.
export function shift_day(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The first day of the week holding this day, 0 for a week starting Sunday and 1 for Monday.
export function week_start_day(day: string, week_start: number): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shift_day(day, -((weekday - week_start + 7) % 7));
}

// ── One exercise ─────────────────────────────────────────────────────────────

export interface HistoryRecord {
  date: string;
  workout_id: string;
  workout_name: string;
  notes: string;
  sets: LoggedSet[];
}

// Every time an exercise was done, newest day first.
export function exercise_history(workouts: Workout[], exercise_id: string): HistoryRecord[] {
  return workouts
    .flatMap((workout) =>
      workout.entries
        .filter((entry) => entry.exercise_id === exercise_id)
        .map((entry) => ({ date: workout.date, workout_id: workout.id, workout_name: workout.name, notes: entry.notes, sets: entry.sets })),
    )
    .sort((first, second) => second.date.localeCompare(first.date));
}

export interface ExerciseStats {
  workouts: number;
  last_done: string | null;
  sets: number;
  total_reps: number;
  total_volume: number;
  best_weight: number;
  best_reps: number;
  best_one_rep_max: number;
  best_set_volume: number;
  best_duration: number;
  best_distance: number;
}

// Every record whatever the measurement, so the page shows the ones that mean something; never done reports zeroes.
export function exercise_stats(history: HistoryRecord[], measurement: Measurement | undefined): ExerciseStats {
  const stats: ExerciseStats = {
    workouts: history.length,
    last_done: history[0]?.date ?? null,
    sets: 0,
    total_reps: 0,
    total_volume: 0,
    best_weight: 0,
    best_reps: 0,
    best_one_rep_max: 0,
    best_set_volume: 0,
    best_duration: 0,
    best_distance: 0,
  };
  for (const record of history) {
    for (const set of record.sets) {
      const volume = set_volume(set, measurement);
      stats.sets += 1;
      stats.total_reps += set.reps;
      stats.total_volume += volume;
      stats.best_set_volume = Math.max(stats.best_set_volume, volume);
      stats.best_weight = Math.max(stats.best_weight, set.weight);
      stats.best_reps = Math.max(stats.best_reps, set.reps);
      stats.best_one_rep_max = Math.max(stats.best_one_rep_max, estimated_one_rep_max(set));
      stats.best_duration = Math.max(stats.best_duration, set.duration);
      stats.best_distance = Math.max(stats.best_distance, set.distance);
    }
  }
  return stats;
}

export interface TrendPoint {
  date: string;
  sets: number;
  reps: number;
  volume: number;
  top_weight: number;
  top_reps: number;
  one_rep_max: number;
  duration: number;
  distance: number;
}

export type TrendMetric = Exclude<keyof TrendPoint, "date">;

// One point per day trained, oldest first; two workouts on one day fold into one point.
export function exercise_trend(history: HistoryRecord[], measurement: Measurement | undefined): TrendPoint[] {
  const by_date = new Map<string, TrendPoint>();
  for (const record of history) {
    const point = by_date.get(record.date) ?? { date: record.date, sets: 0, reps: 0, volume: 0, top_weight: 0, top_reps: 0, one_rep_max: 0, duration: 0, distance: 0 };
    for (const set of record.sets) {
      point.sets += 1;
      point.reps += set.reps;
      point.duration += set.duration;
      point.distance += set.distance;
      point.volume += set_volume(set, measurement);
      point.top_weight = Math.max(point.top_weight, set.weight);
      point.top_reps = Math.max(point.top_reps, set.reps);
      point.one_rep_max = Math.max(point.one_rep_max, estimated_one_rep_max(set));
    }
    by_date.set(record.date, point);
  }
  return [...by_date.values()].sort((first, second) => first.date.localeCompare(second.date));
}

// ── Leaders ──────────────────────────────────────────────────────────────────

export type LeaderStat = "total_volume" | "best_weight" | "best_one_rep_max" | "sets" | "workouts";

export const leaderboards: { key: LeaderStat; label: string; kind: "weight" | "sets" | "sessions" }[] = [
  { key: "total_volume", label: "Most Volume", kind: "weight" },
  { key: "best_weight", label: "Heaviest Set", kind: "weight" },
  { key: "best_one_rep_max", label: "Best Est. 1RM", kind: "weight" },
  { key: "sets", label: "Most Sets", kind: "sets" },
  { key: "workouts", label: "Most Sessions", kind: "sessions" },
];

export interface RankedExercise {
  exercise: Exercise;
  stats: ExerciseStats;
}

// The best few on one stat; anything that never scored on it is left off rather than listed at zero.
export function leaderboard(ranked: RankedExercise[], key: LeaderStat, limit = 5): RankedExercise[] {
  return ranked
    .filter((item) => item.stats[key] > 0)
    .sort((first, second) => second.stats[key] - first.stats[key])
    .slice(0, limit);
}

// ── Weeks ────────────────────────────────────────────────────────────────────

export interface WeekTotals {
  week_start: string;
  week_end: string;
  workouts: number;
  sets: number;
  volume: number;
  duration: number;
  distance: number;
}

// The given number of weeks up to the one holding today, oldest first.
export function weekly_totals(workouts: Workout[], measurement_by_exercise: Map<string, Measurement>, weeks: number, today: string, week_start: number): WeekTotals[] {
  const this_week = week_start_day(today, week_start);
  return Array.from({ length: weeks }, (_, index) => {
    const start = shift_day(this_week, -7 * (weeks - 1 - index));
    const end = shift_day(start, 6);
    const totals: WeekTotals = { week_start: start, week_end: end, workouts: 0, sets: 0, volume: 0, duration: 0, distance: 0 };
    for (const workout of workouts) {
      if (workout.date < start || workout.date > end) continue;
      const sums = workout_totals(workout, measurement_by_exercise);
      totals.workouts += 1;
      totals.sets += sums.sets;
      totals.volume += sums.volume;
      totals.duration += sums.duration;
      totals.distance += sums.distance;
    }
    return totals;
  });
}

// ── Days and categories ──────────────────────────────────────────────────────

export interface DayActivity {
  date: string;
  workouts: number;
  sets: number;
}

// Every day from first to last, oldest first, with what was logged on it.
export function daily_activity(workouts: Workout[], first: string, last: string): DayActivity[] {
  const days: DayActivity[] = [];
  for (let date = first; date <= last; date = shift_day(date, 1)) days.push({ date, workouts: 0, sets: 0 });
  const by_date = new Map(days.map((day) => [day.date, day]));
  for (const workout of workouts) {
    const day = by_date.get(workout.date);
    if (!day) continue;
    day.workouts += 1;
    day.sets += workout.entries.reduce((sum, entry) => sum + entry.sets.length, 0);
  }
  return days;
}

export interface CategorySets {
  // The top of the exercise's category path, empty for an uncategorised exercise.
  category: string;
  sets: number;
}

// The name of the top-level category each of an exercise's categories sits under.
function top_categories(exercise: Exercise, categories: Category[]): string[] {
  return [...new Set(known_category_ids(exercise.categories, categories).map((id) => category_path(id, categories)[0]!))];
}

// Sets logged from first to last per top category, most first; an exercise in several categories counts in each.
export function category_sets(workouts: Workout[], exercises: Exercise[], categories: Category[], first: string, last: string): CategorySets[] {
  const tops = new Map(exercises.map((exercise) => [exercise.id, top_categories(exercise, categories)]));
  const sets = new Map<string, number>();
  for (const workout of workouts) {
    if (workout.date < first || workout.date > last) continue;
    for (const entry of workout.entries) {
      const categories = tops.get(entry.exercise_id) ?? [];
      for (const category of categories.length ? categories : [""]) sets.set(category, (sets.get(category) ?? 0) + entry.sets.length);
    }
  }
  return [...sets].filter(([, count]) => count > 0).map(([category, count]) => ({ category, sets: count })).sort((first_row, second_row) => second_row.sets - first_row.sets);
}
