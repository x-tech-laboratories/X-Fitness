// Workouts: the exercise library, programs of sessions that plan exercises, logged workouts with their sets, progression
// when a workout is finished, reports on the log, wger lookup, and imports from the Trilium add-on and Liftosaur.

// ── Imports ──────────────────────────────────────────────────────────────────

import { in_transaction, type SqlDatabase, type SqlValue } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, new_id } from "../feature.ts";
import { read_liftosaur_export, type LiftosaurSummary } from "./liftosaur.ts";
import {
  category_ancestors,
  category_depth,
  category_leaf,
  is_in_category,
  is_measurement,
  is_progressable,
  non_negative,
  normalize_categories,
  normalize_category_name,
  normalize_names,
  normalize_progression,
  positive,
  trimmed,
  type Exercise,
  type LoggedSet,
  type Measurement,
  type Program,
  type Progression,
  type Session,
  type SessionEntry,
  type SetValues,
  type Target,
  type Workout,
  type WorkoutEntry,
  type WorkoutsDocument,
} from "./model.ts";
import { evaluate_progression, type Outcome } from "./progression.ts";
import { exercise_history, exercise_stats, exercise_trend, leaderboard, leaderboards, weekly_totals, type ExerciseStats, type HistoryRecord, type TrendPoint, type WeekTotals } from "./reports.ts";
import { read_trilium_database, write_trilium_database, type FileUnits } from "./trilium.ts";
import { search_wger, type WgerResult } from "./wger.ts";

// ── Schema ───────────────────────────────────────────────────────────────────

// Exercise ids are kept without a foreign key, so deleting an exercise leaves the sessions and log that used it alone.
const schema = `
  CREATE TABLE workout_categories (name TEXT PRIMARY KEY);
  CREATE TABLE exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    measurement TEXT NOT NULL DEFAULT 'weight',
    equipment TEXT NOT NULL DEFAULT '',
    muscles TEXT NOT NULL DEFAULT '[]',
    categories TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE programs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE program_sessions (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    categories TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX program_sessions_by_program ON program_sessions (program_id);
  CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES program_sessions (id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    sets REAL NOT NULL DEFAULT 3,
    reps REAL NOT NULL DEFAULT 0,
    weight_kg REAL NOT NULL DEFAULT 0,
    duration_s REAL NOT NULL DEFAULT 0,
    distance_km REAL NOT NULL DEFAULT 0,
    rest_s REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    progression_type TEXT NOT NULL DEFAULT 'none',
    increment REAL NOT NULL DEFAULT 0,
    increment_percent INTEGER NOT NULL DEFAULT 0,
    successes REAL NOT NULL DEFAULT 1,
    success_counter REAL NOT NULL DEFAULT 0,
    decrement REAL NOT NULL DEFAULT 0,
    decrement_percent INTEGER NOT NULL DEFAULT 0,
    failures REAL NOT NULL DEFAULT 1,
    failure_counter REAL NOT NULL DEFAULT 0,
    min_reps REAL NOT NULL DEFAULT 0,
    max_reps REAL NOT NULL DEFAULT 0,
    reps_threshold REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX session_exercises_by_session ON session_exercises (session_id);
  CREATE TABLE workouts (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Workout',
    session_id TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT '',
    finished_at TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX workouts_by_date ON workouts (date);
  CREATE TABLE workout_exercises (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL DEFAULT '',
    session_entry_id TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    target_sets REAL NOT NULL DEFAULT 0,
    target_reps REAL NOT NULL DEFAULT 0,
    target_weight_kg REAL NOT NULL DEFAULT 0,
    target_duration_s REAL NOT NULL DEFAULT 0,
    target_distance_km REAL NOT NULL DEFAULT 0,
    target_rest_s REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX workout_exercises_by_workout ON workout_exercises (workout_id);
  CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY,
    workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    reps REAL NOT NULL DEFAULT 0,
    weight_kg REAL NOT NULL DEFAULT 0,
    duration_s REAL NOT NULL DEFAULT 0,
    distance_km REAL NOT NULL DEFAULT 0,
    rpe REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX workout_sets_by_entry ON workout_sets (workout_exercise_id);
`;

// ── Rows ─────────────────────────────────────────────────────────────────────

interface ExerciseRow {
  id: string;
  name: string;
  measurement: string;
  equipment: string;
  muscles: string;
  categories: string;
  notes: string;
}

interface SessionRow {
  id: string;
  program_id: string;
  name: string;
  notes: string;
  categories: string;
}

interface SessionExerciseRow {
  id: string;
  session_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight_kg: number;
  duration_s: number;
  distance_km: number;
  rest_s: number;
  notes: string;
  progression_type: string;
  increment: number;
  increment_percent: number;
  successes: number;
  success_counter: number;
  decrement: number;
  decrement_percent: number;
  failures: number;
  failure_counter: number;
  min_reps: number;
  max_reps: number;
  reps_threshold: number;
}

interface WorkoutRow {
  id: string;
  date: string;
  name: string;
  session_id: string;
  started_at: string;
  finished_at: string;
  notes: string;
}

interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  session_entry_id: string;
  notes: string;
  target_sets: number;
  target_reps: number;
  target_weight_kg: number;
  target_duration_s: number;
  target_distance_km: number;
  target_rest_s: number;
}

interface SetRow {
  id: string;
  workout_exercise_id: string;
  reps: number;
  weight_kg: number;
  duration_s: number;
  distance_km: number;
  rpe: number;
}

function parse_list(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function to_exercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    measurement: is_measurement(row.measurement) ? row.measurement : "weight",
    equipment: row.equipment,
    muscles: parse_list(row.muscles),
    categories: parse_list(row.categories),
    notes: row.notes,
  };
}

function to_session_entry(row: SessionExerciseRow): SessionEntry {
  return {
    id: row.id,
    exercise_id: row.exercise_id,
    sets: row.sets,
    reps: row.reps,
    weight: row.weight_kg,
    duration: row.duration_s,
    distance: row.distance_km,
    rest: row.rest_s,
    notes: row.notes,
    progression: normalize_progression({
      type: row.progression_type as Progression["type"],
      increment: row.increment,
      increment_percent: row.increment_percent === 1,
      successes: row.successes,
      success_counter: row.success_counter,
      decrement: row.decrement,
      decrement_percent: row.decrement_percent === 1,
      failures: row.failures,
      failure_counter: row.failure_counter,
      min_reps: row.min_reps,
      max_reps: row.max_reps,
      reps_threshold: row.reps_threshold,
    }),
  };
}

function to_set(row: SetRow): LoggedSet {
  return { id: row.id, reps: row.reps, weight: row.weight_kg, duration: row.duration_s, distance: row.distance_km, rpe: row.rpe };
}

// ── Loading ──────────────────────────────────────────────────────────────────

function load_exercises(database: SqlDatabase): Exercise[] {
  const rows = database.prepare("SELECT * FROM exercises ORDER BY name COLLATE NOCASE").all() as ExerciseRow[];
  return rows.map(to_exercise);
}

function measurement_map(exercises: Exercise[]): Map<string, Measurement> {
  return new Map(exercises.map((exercise) => [exercise.id, exercise.measurement]));
}

function load_sessions(database: SqlDatabase, where = "1", ...params: SqlValue[]): Session[] {
  const sessions = database.prepare(`SELECT * FROM program_sessions WHERE ${where} ORDER BY position, rowid`).all(...params) as SessionRow[];
  if (sessions.length === 0) return [];
  const entries = database
    .prepare(`SELECT * FROM session_exercises WHERE session_id IN (SELECT id FROM program_sessions WHERE ${where}) ORDER BY position, rowid`)
    .all(...params) as SessionExerciseRow[];
  return sessions.map((row) => ({
    id: row.id,
    program_id: row.program_id,
    name: row.name,
    notes: row.notes,
    categories: parse_list(row.categories),
    entries: entries.filter((entry) => entry.session_id === row.id).map(to_session_entry),
  }));
}

function load_programs(database: SqlDatabase): Program[] {
  const programs = database.prepare("SELECT * FROM programs ORDER BY name COLLATE NOCASE").all() as { id: string; name: string; notes: string }[];
  const sessions = load_sessions(database);
  return programs.map((program) => ({ ...program, sessions: sessions.filter((session) => session.program_id === program.id) }));
}

function find_session(database: SqlDatabase, session_id: string): Session | null {
  if (!session_id) return null;
  return load_sessions(database, "id = ?", session_id)[0] ?? null;
}

function load_workouts(database: SqlDatabase, where = "1", ...params: SqlValue[]): Workout[] {
  const workouts = database.prepare(`SELECT * FROM workouts WHERE ${where} ORDER BY date, started_at, rowid`).all(...params) as WorkoutRow[];
  if (workouts.length === 0) return [];
  const in_workouts = `SELECT id FROM workouts WHERE ${where}`;
  const entries = database.prepare(`SELECT * FROM workout_exercises WHERE workout_id IN (${in_workouts}) ORDER BY position, rowid`).all(...params) as WorkoutExerciseRow[];
  const sets = database
    .prepare(`SELECT * FROM workout_sets WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id IN (${in_workouts})) ORDER BY position, rowid`)
    .all(...params) as SetRow[];
  const sets_by_entry = Map.groupBy(sets, (set) => set.workout_exercise_id);
  const entries_by_workout = Map.groupBy(entries, (entry) => entry.workout_id);
  return workouts.map((row) => ({
    ...row,
    entries: (entries_by_workout.get(row.id) ?? []).map(
      (entry): WorkoutEntry => ({
        id: entry.id,
        exercise_id: entry.exercise_id,
        session_entry_id: entry.session_entry_id,
        notes: entry.notes,
        target: {
          sets: entry.target_sets,
          reps: entry.target_reps,
          weight: entry.target_weight_kg,
          duration: entry.target_duration_s,
          distance: entry.target_distance_km,
          rest: entry.target_rest_s,
        },
        sets: (sets_by_entry.get(entry.id) ?? []).map(to_set),
      }),
    ),
  }));
}

// The managed categories, every one in use, and every parent their paths imply.
function all_categories(database: SqlDatabase, exercises: Exercise[], sessions: Session[]): string[] {
  const managed = (database.prepare("SELECT name FROM workout_categories").all() as { name: string }[]).map((row) => row.name);
  const used = [...managed, ...exercises.flatMap((item) => item.categories), ...sessions.flatMap((item) => item.categories)];
  return normalize_categories(used.flatMap((name) => [name, ...category_ancestors(name)]));
}

// ── Writing ──────────────────────────────────────────────────────────────────

function next_position(database: SqlDatabase, table: string, parent_column: string, parent_id: string): number {
  const row = database.prepare(`SELECT coalesce(max(position), -1) + 1 AS position FROM ${table} WHERE ${parent_column} = ?`).get(parent_id) as { position: number };
  return row.position;
}

function write_exercise(database: SqlDatabase, exercise: Exercise): void {
  database
    .prepare(
      `INSERT INTO exercises (id, name, measurement, equipment, muscles, categories, notes) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, measurement = excluded.measurement, equipment = excluded.equipment,
         muscles = excluded.muscles, categories = excluded.categories, notes = excluded.notes`,
    )
    .run(exercise.id, exercise.name, exercise.measurement, exercise.equipment, JSON.stringify(exercise.muscles), JSON.stringify(exercise.categories), exercise.notes);
}

function write_session_entry(database: SqlDatabase, session_id: string, position: number, entry: SessionEntry): void {
  const progression = entry.progression;
  database
    .prepare(
      `INSERT INTO session_exercises (id, session_id, exercise_id, position, sets, reps, weight_kg, duration_s, distance_km, rest_s, notes,
         progression_type, increment, increment_percent, successes, success_counter, decrement, decrement_percent, failures, failure_counter,
         min_reps, max_reps, reps_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET exercise_id = excluded.exercise_id, position = excluded.position, sets = excluded.sets, reps = excluded.reps,
         weight_kg = excluded.weight_kg, duration_s = excluded.duration_s, distance_km = excluded.distance_km, rest_s = excluded.rest_s,
         notes = excluded.notes, progression_type = excluded.progression_type, increment = excluded.increment,
         increment_percent = excluded.increment_percent, successes = excluded.successes, success_counter = excluded.success_counter,
         decrement = excluded.decrement, decrement_percent = excluded.decrement_percent, failures = excluded.failures,
         failure_counter = excluded.failure_counter, min_reps = excluded.min_reps, max_reps = excluded.max_reps, reps_threshold = excluded.reps_threshold`,
    )
    .run(
      entry.id,
      session_id,
      entry.exercise_id,
      position,
      entry.sets,
      entry.reps,
      entry.weight,
      entry.duration,
      entry.distance,
      entry.rest,
      entry.notes,
      progression.type,
      progression.increment,
      progression.increment_percent ? 1 : 0,
      progression.successes,
      progression.success_counter,
      progression.decrement,
      progression.decrement_percent ? 1 : 0,
      progression.failures,
      progression.failure_counter,
      progression.min_reps,
      progression.max_reps,
      progression.reps_threshold,
    );
}

function insert_workout_entry(database: SqlDatabase, workout_id: string, position: number, entry: Omit<WorkoutEntry, "sets">): void {
  database
    .prepare(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, session_entry_id, position, notes,
         target_sets, target_reps, target_weight_kg, target_duration_s, target_distance_km, target_rest_s)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(entry.id, workout_id, entry.exercise_id, entry.session_entry_id, position, entry.notes, entry.target.sets, entry.target.reps, entry.target.weight, entry.target.duration, entry.target.distance, entry.target.rest);
}

function insert_set(database: SqlDatabase, entry_id: string, position: number, set: LoggedSet): void {
  database
    .prepare("INSERT INTO workout_sets (id, workout_exercise_id, position, reps, weight_kg, duration_s, distance_km, rpe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(set.id, entry_id, position, set.reps, set.weight, set.duration, set.distance, set.rpe);
}

function insert_workout(database: SqlDatabase, workout: Workout): void {
  database
    .prepare("INSERT INTO workouts (id, date, name, session_id, started_at, finished_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(workout.id, workout.date, workout.name, workout.session_id, workout.started_at, workout.finished_at, workout.notes);
  workout.entries.forEach((entry, position) => {
    insert_workout_entry(database, workout.id, position, entry);
    entry.sets.forEach((set, set_position) => insert_set(database, entry.id, set_position, set));
  });
}

// Every tag on every exercise and session rewritten by the same rule.
function retag(database: SqlDatabase, change: (tags: string[]) => string[]): void {
  for (const table of ["exercises", "program_sessions"]) {
    const rows = database.prepare(`SELECT id, categories FROM ${table}`).all() as { id: string; categories: string }[];
    for (const row of rows) {
      const next = JSON.stringify(normalize_categories(change(parse_list(row.categories))));
      if (next !== row.categories) database.prepare(`UPDATE ${table} SET categories = ? WHERE id = ?`).run(next, row.id);
    }
  }
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export type ExerciseInput = Partial<Exercise> & { name: string };

export interface SessionEntryInput extends Partial<SetValues> {
  id?: string;
  exercise_id: string;
  sets?: number;
  rest?: number;
  notes?: string;
  progression?: Partial<Progression>;
}

export interface SessionInput {
  id?: string;
  name: string;
  notes?: string;
  categories?: string[];
  entries: SessionEntryInput[];
}

function normalize_entry(input: SessionEntryInput): SessionEntry {
  return {
    id: input.id || new_id(),
    exercise_id: input.exercise_id,
    sets: positive(input.sets, 3),
    reps: non_negative(input.reps),
    weight: non_negative(input.weight),
    duration: non_negative(input.duration),
    distance: non_negative(input.distance),
    rest: non_negative(input.rest),
    notes: trimmed(input.notes),
    progression: normalize_progression(input.progression),
  };
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface LibraryExercise extends Exercise {
  last_done: string | null;
}

export interface WorkoutLibrary {
  exercises: LibraryExercise[];
  programs: Program[];
  categories: string[];
  equipment: string[];
  muscles: string[];
}

export interface CategoryUsage {
  name: string;
  depth: number;
  leaf: string;
  exercises: number;
  sessions: number;
  // Counted with every subcategory.
  exercises_in_tree: number;
  sessions_in_tree: number;
}

export interface LoggedWorkout extends Workout {
  // Whether the session it came from still exists, so finishing it has a plan to progress.
  has_session: boolean;
}

export interface ProgressionReport {
  entry_id: string;
  exercise_id: string;
  exercise_name: string;
  outcome: Outcome;
  counter: string;
  from: { reps: number; weight: number };
  to: { reps: number; weight: number };
}

export interface LeaderRow {
  exercise_id: string;
  name: string;
  value: number;
}

export interface WorkoutReport {
  weeks: WeekTotals[];
  leaders: { key: string; label: string; kind: "weight" | "sets" | "sessions"; rows: LeaderRow[] }[];
  // Every exercise ever logged, newest first.
  bests: { exercise: Exercise; stats: ExerciseStats }[];
}

export interface ExerciseReport {
  exercise: Exercise;
  stats: ExerciseStats;
  trend: TrendPoint[];
  history: HistoryRecord[];
}

export interface TriliumImportSummary {
  exercises: number;
  programs: number;
  sessions: number;
  workouts: number;
  // Workouts already present, left as they are.
  skipped_workouts: number;
}

// ── Merging ──────────────────────────────────────────────────────────────────

// Adds by id: exercises are added or updated, a program present gains the sessions it lacks, and a workout present is skipped.
function merge_document(database: SqlDatabase, document: WorkoutsDocument): TriliumImportSummary {
  const summary: TriliumImportSummary = { exercises: 0, programs: 0, sessions: 0, workouts: 0, skipped_workouts: 0 };
  const exists = (table: string, id: string) => database.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) !== undefined;
  in_transaction(database, () => {
    for (const name of document.categories) database.prepare("INSERT OR IGNORE INTO workout_categories (name) VALUES (?)").run(name);
    for (const exercise of document.exercises) {
      write_exercise(database, exercise);
      summary.exercises += 1;
    }
    for (const program of document.programs) {
      if (!exists("programs", program.id)) {
        database.prepare("INSERT INTO programs (id, name, notes) VALUES (?, ?, ?)").run(program.id, program.name, program.notes);
        summary.programs += 1;
      }
      for (const session of program.sessions) {
        if (exists("program_sessions", session.id)) continue;
        database
          .prepare("INSERT INTO program_sessions (id, program_id, position, name, notes, categories) VALUES (?, ?, ?, ?, ?, ?)")
          .run(session.id, program.id, next_position(database, "program_sessions", "program_id", program.id), session.name, session.notes, JSON.stringify(session.categories));
        session.entries.forEach((entry, position) => write_session_entry(database, session.id, position, exists("session_exercises", entry.id) ? { ...entry, id: new_id() } : entry));
        summary.sessions += 1;
      }
    }
    for (const workout of document.workouts) {
      if (exists("workouts", workout.id)) {
        summary.skipped_workouts += 1;
        continue;
      }
      // Nothing points at an entry or a set, so they get fresh ids that cannot clash.
      insert_workout(database, { ...workout, entries: workout.entries.map((entry) => ({ ...entry, id: new_id(), sets: entry.sets.map((set) => ({ ...set, id: new_id() })) })) });
      summary.workouts += 1;
    }
  });
  return summary;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const workout_setting_defaults = {
  // Seconds of rest a new session exercise starts with, and the rest timer's for an exercise added mid-workout.
  "workouts.default_rest": 90,
  "workouts.rest_sound": true,
  "workouts.weekly_target": 3,
};

export const workouts_feature = define_feature({
  id: "workouts",
  migrations: [schema],
  tables: [
    { name: "workout_categories", key_columns: ["name"] },
    { name: "exercises", key_columns: ["id"] },
    { name: "programs", key_columns: ["id"] },
    { name: "program_sessions", key_columns: ["id"] },
    { name: "session_exercises", key_columns: ["id"] },
    { name: "workouts", key_columns: ["id"] },
    { name: "workout_exercises", key_columns: ["id"] },
    { name: "workout_sets", key_columns: ["id"] },
  ],
  methods: {
    // ── Library ──

    get_workout_library: (database: SqlDatabase): WorkoutLibrary => {
      const exercises = load_exercises(database);
      const programs = load_programs(database);
      const last_done = new Map(
        (database.prepare("SELECT entry.exercise_id AS id, max(workout.date) AS date FROM workout_exercises AS entry JOIN workouts AS workout ON workout.id = entry.workout_id GROUP BY entry.exercise_id").all() as { id: string; date: string }[]).map(
          (row) => [row.id, row.date],
        ),
      );
      return {
        exercises: exercises.map((exercise) => ({ ...exercise, last_done: last_done.get(exercise.id) ?? null })),
        programs,
        categories: all_categories(database, exercises, programs.flatMap((program) => program.sessions)),
        equipment: normalize_names(exercises.map((exercise) => exercise.equipment)),
        muscles: normalize_names(exercises.flatMap((exercise) => exercise.muscles)),
      };
    },

    save_exercise: (database: SqlDatabase, input: ExerciseInput): string => {
      const name = trimmed(input.name);
      if (!name) throw new Error("An exercise needs a name.");
      const exercise: Exercise = {
        id: input.id || new_id(),
        name,
        measurement: is_measurement(input.measurement) ? input.measurement : "weight",
        equipment: trimmed(input.equipment),
        muscles: normalize_names(input.muscles),
        categories: normalize_categories(input.categories),
        notes: trimmed(input.notes),
      };
      write_exercise(database, exercise);
      return exercise.id;
    },

    // Sessions and logged sets keep the id, and show it as a deleted exercise.
    delete_exercise: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM exercises WHERE id = ?").run(id);
    },

    search_wger_exercises: (_database: SqlDatabase, term: string): Promise<WgerResult[]> => search_wger(term),

    // ── Categories ──

    list_workout_categories: (database: SqlDatabase): CategoryUsage[] => {
      const exercises = load_exercises(database);
      const sessions = load_sessions(database);
      const count = (items: { categories: string[] }[], name: string, tree: boolean) =>
        items.filter((item) => (tree ? item.categories.some((tag) => is_in_category(tag, name)) : item.categories.includes(name))).length;
      return all_categories(database, exercises, sessions).map((name) => ({
        name,
        depth: category_depth(name),
        leaf: category_leaf(name),
        exercises: count(exercises, name, false),
        sessions: count(sessions, name, false),
        exercises_in_tree: count(exercises, name, true),
        sessions_in_tree: count(sessions, name, true),
      }));
    },

    add_workout_category: (database: SqlDatabase, name: string): void => {
      const normalized = normalize_category_name(name);
      if (normalized) database.prepare("INSERT OR IGNORE INTO workout_categories (name) VALUES (?)").run(normalized);
    },

    // The subtree moves with it, and a name already in use merges the two.
    rename_workout_category: (database: SqlDatabase, from: string, to: string): void => {
      const target = normalize_category_name(to);
      if (!target || target === from) return;
      const rename = (tags: string[]) => tags.map((tag) => (is_in_category(tag, from) ? target + tag.slice(from.length) : tag));
      in_transaction(database, () => {
        retag(database, rename);
        const managed = (database.prepare("SELECT name FROM workout_categories").all() as { name: string }[]).map((row) => row.name);
        const moved = managed.filter((name) => is_in_category(name, from));
        for (const name of moved) database.prepare("DELETE FROM workout_categories WHERE name = ?").run(name);
        for (const name of normalize_categories(rename(moved))) database.prepare("INSERT OR IGNORE INTO workout_categories (name) VALUES (?)").run(name);
      });
    },

    // Its subtree goes too; the exercises and sessions are kept, untagged.
    delete_workout_category: (database: SqlDatabase, name: string): void => {
      in_transaction(database, () => {
        retag(database, (tags) => tags.filter((tag) => !is_in_category(tag, name)));
        const managed = (database.prepare("SELECT name FROM workout_categories").all() as { name: string }[]).map((row) => row.name);
        for (const managed_name of managed.filter((item) => is_in_category(item, name))) database.prepare("DELETE FROM workout_categories WHERE name = ?").run(managed_name);
      });
    },

    // ── Programs ──

    save_program: (database: SqlDatabase, input: { id?: string; name: string; notes?: string }): string => {
      const name = trimmed(input.name);
      if (!name) throw new Error("A program needs a name.");
      const id = input.id || new_id();
      database
        .prepare("INSERT INTO programs (id, name, notes) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, notes = excluded.notes")
        .run(id, name, trimmed(input.notes));
      return id;
    },

    // Its sessions go with it; workouts logged from them stay.
    delete_program: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM programs WHERE id = ?").run(id);
    },

    // Writes the session whole: its entries in the order given, dropping any no longer listed or naming no exercise.
    save_program_session: (database: SqlDatabase, program_id: string, input: SessionInput): string => {
      const name = trimmed(input.name);
      if (!name) throw new Error("A session needs a name.");
      const id = input.id || new_id();
      const entries = input.entries.filter((entry) => entry.exercise_id).map(normalize_entry);
      in_transaction(database, () => {
        const existing = database.prepare("SELECT 1 FROM program_sessions WHERE id = ?").get(id) !== undefined;
        if (existing) {
          database.prepare("UPDATE program_sessions SET name = ?, notes = ?, categories = ? WHERE id = ?").run(name, trimmed(input.notes), JSON.stringify(normalize_categories(input.categories)), id);
        } else {
          database
            .prepare("INSERT INTO program_sessions (id, program_id, position, name, notes, categories) VALUES (?, ?, ?, ?, ?, ?)")
            .run(id, program_id, next_position(database, "program_sessions", "program_id", program_id), name, trimmed(input.notes), JSON.stringify(normalize_categories(input.categories)));
        }
        const kept = new Set(entries.map((entry) => entry.id));
        const current = database.prepare("SELECT id FROM session_exercises WHERE session_id = ?").all(id) as { id: string }[];
        for (const row of current) if (!kept.has(row.id)) database.prepare("DELETE FROM session_exercises WHERE id = ?").run(row.id);
        entries.forEach((entry, position) => write_session_entry(database, id, position, entry));
      });
      return id;
    },

    delete_program_session: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM program_sessions WHERE id = ?").run(id);
    },

    // Swaps with its neighbour; the order is the order the program runs in.
    move_program_session: (database: SqlDatabase, id: string, delta: -1 | 1): void => {
      const row = database.prepare("SELECT program_id FROM program_sessions WHERE id = ?").get(id) as { program_id: string } | undefined;
      if (!row) return;
      const ids = (database.prepare("SELECT id FROM program_sessions WHERE program_id = ? ORDER BY position, rowid").all(row.program_id) as { id: string }[]).map((item) => item.id);
      const index = ids.indexOf(id);
      const target = index + delta;
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      in_transaction(database, () => ids.forEach((session_id, position) => database.prepare("UPDATE program_sessions SET position = ? WHERE id = ?").run(position, session_id)));
    },

    // ── Log ──

    list_workouts: (database: SqlDatabase, date: string): LoggedWorkout[] => {
      return load_workouts(database, "date = ?", date).map((workout) => ({
        ...workout,
        has_session: workout.session_id !== "" && database.prepare("SELECT 1 FROM program_sessions WHERE id = ?").get(workout.session_id) !== undefined,
      }));
    },

    // From a session, each of its exercises comes with its target sets already made; without one it starts empty.
    start_workout: (database: SqlDatabase, date: string, session_id: string | null, started_at: string): string => {
      const session = session_id ? find_session(database, session_id) : null;
      if (session_id && !session) throw new Error("That session no longer exists.");
      const program = session ? (database.prepare("SELECT name FROM programs WHERE id = ?").get(session.program_id) as { name: string } | undefined) : undefined;
      const workout: Workout = {
        id: new_id(),
        date,
        name: session ? (program?.name ? `${program.name} - ${session.name}` : session.name) : "Workout",
        session_id: session?.id ?? "",
        started_at,
        finished_at: "",
        notes: "",
        entries: (session?.entries ?? []).map((entry) => ({
          id: new_id(),
          exercise_id: entry.exercise_id,
          session_entry_id: entry.id,
          target: { sets: entry.sets, reps: entry.reps, weight: entry.weight, duration: entry.duration, distance: entry.distance, rest: entry.rest },
          notes: entry.notes,
          sets: Array.from({ length: Math.round(entry.sets) }, () => ({ id: new_id(), reps: entry.reps, weight: entry.weight, duration: entry.duration, distance: entry.distance, rpe: 0 })),
        })),
      };
      in_transaction(database, () => insert_workout(database, workout));
      return workout.id;
    },

    update_workout: (database: SqlDatabase, id: string, changes: { name?: string; notes?: string; date?: string }): void => {
      if (changes.name !== undefined) database.prepare("UPDATE workouts SET name = ? WHERE id = ?").run(changes.name, id);
      if (changes.notes !== undefined) database.prepare("UPDATE workouts SET notes = ? WHERE id = ?").run(changes.notes, id);
      if (changes.date) database.prepare("UPDATE workouts SET date = ? WHERE id = ?").run(changes.date, id);
    },

    delete_workout: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM workouts WHERE id = ?").run(id);
    },

    // Added mid-workout with one empty set and no target.
    add_workout_exercise: (database: SqlDatabase, workout_id: string, exercise_id: string): string => {
      const id = new_id();
      in_transaction(database, () => {
        insert_workout_entry(database, workout_id, next_position(database, "workout_exercises", "workout_id", workout_id), {
          id,
          exercise_id,
          session_entry_id: "",
          notes: "",
          target: { sets: 0, reps: 0, weight: 0, duration: 0, distance: 0, rest: 0 },
        });
        insert_set(database, id, 0, { id: new_id(), reps: 0, weight: 0, duration: 0, distance: 0, rpe: 0 });
      });
      return id;
    },

    update_workout_exercise: (database: SqlDatabase, id: string, changes: { notes: string }): void => {
      database.prepare("UPDATE workout_exercises SET notes = ? WHERE id = ?").run(changes.notes, id);
    },

    delete_workout_exercise: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM workout_exercises WHERE id = ?").run(id);
    },

    // A new set copies the last one, since sets usually repeat the load.
    add_workout_set: (database: SqlDatabase, workout_exercise_id: string): string => {
      const last = database.prepare("SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position DESC, rowid DESC LIMIT 1").get(workout_exercise_id) as SetRow | undefined;
      const id = new_id();
      const values = last ? to_set(last) : { reps: 0, weight: 0, duration: 0, distance: 0, rpe: 0 };
      insert_set(database, workout_exercise_id, next_position(database, "workout_sets", "workout_exercise_id", workout_exercise_id), { ...values, id });
      return id;
    },

    update_workout_set: (database: SqlDatabase, id: string, changes: Partial<SetValues & { rpe: number }>): void => {
      const columns = { reps: "reps", weight: "weight_kg", duration: "duration_s", distance: "distance_km", rpe: "rpe" } as const;
      for (const [key, column] of Object.entries(columns)) {
        const value = changes[key as keyof typeof columns];
        if (value !== undefined) database.prepare(`UPDATE workout_sets SET ${column} = ? WHERE id = ?`).run(non_negative(value), id);
      }
    },

    delete_workout_set: (database: SqlDatabase, id: string): void => {
      database.prepare("DELETE FROM workout_sets WHERE id = ?").run(id);
    },

    // Runs the session's progressions against the targets the workout started with, rewrites the session's targets, and marks it finished; once only.
    finish_workout: (database: SqlDatabase, id: string, finished_at: string): ProgressionReport[] => {
      const workout = load_workouts(database, "id = ?", id)[0];
      if (!workout || workout.finished_at) return [];
      return in_transaction(database, () => {
        database.prepare("UPDATE workouts SET finished_at = ? WHERE id = ?").run(finished_at, id);
        const session = find_session(database, workout.session_id);
        if (!session) return [];
        const exercises = new Map(load_exercises(database).map((exercise) => [exercise.id, exercise]));
        const reports: ProgressionReport[] = [];
        session.entries.forEach((entry, position) => {
          const logged = workout.entries.find((item) => (item.session_entry_id ? item.session_entry_id === entry.id : item.exercise_id === entry.exercise_id));
          const exercise = exercises.get(entry.exercise_id);
          if (!logged || entry.progression.type === "none" || !is_progressable(exercise)) return;
          // A workout without a snapshot is judged against the targets as they stand now.
          const target: Target = logged.target.sets > 0 ? logged.target : { sets: entry.sets, reps: entry.reps, weight: entry.weight, duration: entry.duration, distance: entry.distance, rest: entry.rest };
          const result = evaluate_progression(entry.progression, target, logged.sets);
          reports.push({
            entry_id: entry.id,
            exercise_id: entry.exercise_id,
            exercise_name: exercise?.name ?? "Deleted exercise",
            outcome: result.outcome,
            counter: result.counter,
            from: { reps: target.reps, weight: target.weight },
            to: { reps: result.changes.reps ?? target.reps, weight: result.changes.weight ?? target.weight },
          });
          write_session_entry(database, session.id, position, { ...entry, ...result.changes, progression: result.progression });
        });
        return reports;
      });
    },

    // ── Reports ──

    get_workout_report: (database: SqlDatabase, options: { weeks: number; today: string; week_start: number }): WorkoutReport => {
      const exercises = load_exercises(database);
      const workouts = load_workouts(database);
      const ranked = exercises
        .map((exercise) => ({ exercise, stats: exercise_stats(exercise_history(workouts, exercise.id), exercise.measurement) }))
        .filter((item) => item.stats.workouts > 0);
      return {
        weeks: weekly_totals(workouts, measurement_map(exercises), options.weeks, options.today, options.week_start),
        leaders: leaderboards.map((board) => ({
          ...board,
          rows: leaderboard(ranked, board.key).map((item) => ({ exercise_id: item.exercise.id, name: item.exercise.name, value: item.stats[board.key] })),
        })),
        bests: [...ranked].sort((first, second) => (second.stats.last_done ?? "").localeCompare(first.stats.last_done ?? "")),
      };
    },

    get_exercise_report: (database: SqlDatabase, exercise_id: string): ExerciseReport | null => {
      const row = database.prepare("SELECT * FROM exercises WHERE id = ?").get(exercise_id) as ExerciseRow | undefined;
      if (!row) return null;
      const exercise = to_exercise(row);
      const history = exercise_history(load_workouts(database, "id IN (SELECT workout_id FROM workout_exercises WHERE exercise_id = ?)", exercise_id), exercise_id);
      return { exercise, stats: exercise_stats(history, exercise.measurement), trend: exercise_trend(history, exercise.measurement), history };
    },

    // ── Import and export ──

    // The whole of it in the Trilium add-on's shape, in kg, km and minutes.
    export_workouts: (database: SqlDatabase): string => {
      const exercises = load_exercises(database);
      const programs = load_programs(database);
      const categories = (database.prepare("SELECT name FROM workout_categories ORDER BY name").all() as { name: string }[]).map((row) => row.name);
      return write_trilium_database({ categories, exercises, programs, workouts: load_workouts(database) });
    },

    // The Trilium add-on's database.json, its numbers read in the units it was kept in.
    import_trilium_workouts: (database: SqlDatabase, json_text: string, units: FileUnits = { mass_unit: "kg", distance_unit: "km" }): TriliumImportSummary => {
      return merge_document(database, read_trilium_database(json_text, units));
    },

    // Liftosaur's JSON backup or history CSV, every weight converted from its own unit.
    import_liftosaur_workouts: (database: SqlDatabase, text: string): LiftosaurSummary => {
      const { document, summary } = read_liftosaur_export(text);
      merge_document(database, document);
      return summary;
    },
  },
  setting_defaults: workout_setting_defaults,
});
