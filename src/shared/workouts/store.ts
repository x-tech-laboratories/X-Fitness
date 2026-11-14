// Workouts: the exercise library, programs of sessions that plan exercises, logged workouts with their sets, progression
// when a workout is finished, reports on the log, wger lookup, and imports from the Trilium add-on and Liftosaur.

// ── Imports ──────────────────────────────────────────────────────────────────

import { asc, eq, inArray, max, ne, sql, synced_tables, type SQLiteTable } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { add_category, delete_category, import_category_paths, move_category, read_categories, rename_category, save_category_refs, type Retag } from "../category_store.ts";
import { category_paths_of, is_in_category, known_category_ids, normalize_category_refs, placed_categories, type Category, type PlacedCategory } from "../category_tree.ts";
import { define_feature, drizzle_of, new_id } from "../feature.ts";
import { workouts_api } from "./api.ts";
import { read_liftosaur_export, type LiftosaurSummary } from "./liftosaur.ts";
import { migrations } from "./migrations/index.ts";
import {
  is_measurement,
  is_progressable,
  non_negative,
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
import { category_sets, daily_activity, exercise_history, exercise_stats, exercise_trend, leaderboard, leaderboards, weekly_totals, type CategorySets, type DayActivity, type ExerciseStats, type HistoryRecord, type TrendPoint, type WeekTotals } from "./reports.ts";
import { exercises, program_sessions, programs, session_exercises, workout_categories, workout_exercises, workout_sets, workout_tables, workouts } from "./schema.ts";
import { workout_setting_defaults } from "./settings.ts";
import { read_trilium_database, write_trilium_database, type FileUnits } from "./trilium.ts";
import { search_wger, wger_picture, type WgerResult } from "./wger.ts";

// ── Rows ─────────────────────────────────────────────────────────────────────

type ExerciseRow = typeof exercises.$inferSelect;
type SessionExerciseRow = typeof session_exercises.$inferSelect;
type SetRow = typeof workout_sets.$inferSelect;
type Condition = ReturnType<typeof eq>;

// The order rows were added in, which breaks ties in position.
const rowid = sql`rowid`;

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

export function load_exercises(database: SqlDatabase): Exercise[] {
  return drizzle_of(database).select().from(exercises).orderBy(sql`${exercises.name} COLLATE NOCASE`).all().map(to_exercise);
}

function pictured_exercise_ids(database: SqlDatabase): Set<string> {
  return new Set(drizzle_of(database).select({ id: exercises.id }).from(exercises).where(ne(exercises.picture, "")).all().map((row) => row.id));
}

function find_exercise(database: SqlDatabase, id: string): Exercise | null {
  const row = drizzle_of(database).select().from(exercises).where(eq(exercises.id, id)).get();
  return row ? to_exercise(row) : null;
}

function measurement_map(exercises: Exercise[]): Map<string, Measurement> {
  return new Map(exercises.map((exercise) => [exercise.id, exercise.measurement]));
}

function load_sessions(database: SqlDatabase, where?: Condition): Session[] {
  const db = drizzle_of(database);
  const sessions = db.select().from(program_sessions).where(where).orderBy(asc(program_sessions.position), rowid).all();
  if (sessions.length === 0) return [];
  const entries = db
    .select()
    .from(session_exercises)
    .where(inArray(session_exercises.session_id, db.select({ id: program_sessions.id }).from(program_sessions).where(where)))
    .orderBy(asc(session_exercises.position), rowid)
    .all();
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
  const rows = drizzle_of(database).select().from(programs).orderBy(sql`${programs.name} COLLATE NOCASE`).all();
  const sessions = load_sessions(database);
  return rows.map((program) => ({ ...program, sessions: sessions.filter((session) => session.program_id === program.id) }));
}

function find_session(database: SqlDatabase, session_id: string): Session | null {
  if (!session_id) return null;
  return load_sessions(database, eq(program_sessions.id, session_id))[0] ?? null;
}

export function load_workouts(database: SqlDatabase, where?: Condition): Workout[] {
  const db = drizzle_of(database);
  const rows = db.select().from(workouts).where(where).orderBy(asc(workouts.date), asc(workouts.started_at), rowid).all();
  if (rows.length === 0) return [];
  const in_workouts = inArray(workout_exercises.workout_id, db.select({ id: workouts.id }).from(workouts).where(where));
  const entries = db.select().from(workout_exercises).where(in_workouts).orderBy(asc(workout_exercises.position), rowid).all();
  const sets = db
    .select()
    .from(workout_sets)
    .where(inArray(workout_sets.workout_exercise_id, db.select({ id: workout_exercises.id }).from(workout_exercises).where(in_workouts)))
    .orderBy(asc(workout_sets.position), rowid)
    .all();
  const sets_by_entry = Map.groupBy(sets, (set) => set.workout_exercise_id);
  const entries_by_workout = Map.groupBy(entries, (entry) => entry.workout_id);
  return rows.map((row) => ({
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

function has_row(database: SqlDatabase, table: SQLiteTable, where: Condition): boolean {
  return drizzle_of(database).select({ found: sql`1` }).from(table).where(where).get() !== undefined;
}

// ── Writing ──────────────────────────────────────────────────────────────────

type PositionColumn = typeof program_sessions.position | typeof workout_exercises.position | typeof workout_sets.position;

// The position after every row under the same parent.
function next_position(database: SqlDatabase, table: SQLiteTable, position: PositionColumn, under: Condition): number {
  return drizzle_of(database)
    .select({ position: sql<number>`coalesce(max(${position}), -1) + 1` })
    .from(table)
    .where(under)
    .get()!.position;
}

// A picture left out keeps the one stored.
function write_exercise(database: SqlDatabase, exercise: Exercise, picture?: string): void {
  const fields = {
    name: exercise.name,
    measurement: exercise.measurement,
    equipment: exercise.equipment,
    muscles: JSON.stringify(exercise.muscles),
    categories: JSON.stringify(exercise.categories),
    notes: exercise.notes,
    ...(picture === undefined ? {} : { picture }),
  };
  drizzle_of(database)
    .insert(exercises)
    .values({ id: exercise.id, ...fields })
    .onConflictDoUpdate({ target: exercises.id, set: fields })
    .run();
}

function write_session_entry(database: SqlDatabase, session_id: string, position: number, entry: SessionEntry): void {
  const progression = entry.progression;
  const fields = {
    exercise_id: entry.exercise_id,
    position,
    sets: entry.sets,
    reps: entry.reps,
    weight_kg: entry.weight,
    duration_s: entry.duration,
    distance_km: entry.distance,
    rest_s: entry.rest,
    notes: entry.notes,
    progression_type: progression.type,
    increment: progression.increment,
    increment_percent: progression.increment_percent ? 1 : 0,
    successes: progression.successes,
    success_counter: progression.success_counter,
    decrement: progression.decrement,
    decrement_percent: progression.decrement_percent ? 1 : 0,
    failures: progression.failures,
    failure_counter: progression.failure_counter,
    min_reps: progression.min_reps,
    max_reps: progression.max_reps,
    reps_threshold: progression.reps_threshold,
  };
  drizzle_of(database)
    .insert(session_exercises)
    .values({ id: entry.id, session_id, ...fields })
    .onConflictDoUpdate({ target: session_exercises.id, set: fields })
    .run();
}

// A new session goes after the program's others.
function insert_session(database: SqlDatabase, program_id: string, session: { id: string; name: string; notes: string; categories: string[] }): void {
  drizzle_of(database)
    .insert(program_sessions)
    .values({
      id: session.id,
      program_id,
      position: next_position(database, program_sessions, program_sessions.position, eq(program_sessions.program_id, program_id)),
      name: session.name,
      notes: session.notes,
      categories: JSON.stringify(session.categories),
    })
    .run();
}

function insert_workout_entry(database: SqlDatabase, workout_id: string, position: number, entry: Omit<WorkoutEntry, "sets">): void {
  drizzle_of(database)
    .insert(workout_exercises)
    .values({
      id: entry.id,
      workout_id,
      exercise_id: entry.exercise_id,
      session_entry_id: entry.session_entry_id,
      position,
      notes: entry.notes,
      target_sets: entry.target.sets,
      target_reps: entry.target.reps,
      target_weight_kg: entry.target.weight,
      target_duration_s: entry.target.duration,
      target_distance_km: entry.target.distance,
      target_rest_s: entry.target.rest,
    })
    .run();
}

function insert_set(database: SqlDatabase, entry_id: string, position: number, set: LoggedSet): void {
  drizzle_of(database)
    .insert(workout_sets)
    .values({ id: set.id, workout_exercise_id: entry_id, position, reps: set.reps, weight_kg: set.weight, duration_s: set.duration, distance_km: set.distance, rpe: set.rpe })
    .run();
}

function insert_workout(database: SqlDatabase, workout: Workout): void {
  drizzle_of(database)
    .insert(workouts)
    .values({ id: workout.id, date: workout.date, name: workout.name, session_id: workout.session_id, started_at: workout.started_at, finished_at: workout.finished_at, notes: workout.notes })
    .run();
  workout.entries.forEach((entry, position) => {
    insert_workout_entry(database, workout.id, position, entry);
    entry.sets.forEach((set, set_position) => insert_set(database, entry.id, set_position, set));
  });
}

// Every exercise and session whose categories the rule changes, rewritten.
function retag(database: SqlDatabase): Retag {
  return (change) => {
    const db = drizzle_of(database);
    for (const table of [exercises, program_sessions]) {
      const rows = db.select({ id: table.id, categories: table.categories }).from(table).all();
      for (const row of rows) {
        const next = JSON.stringify(change(parse_list(row.categories)));
        if (next !== row.categories) db.update(table).set({ categories: next }).where(eq(table.id, row.id)).run();
      }
    }
  };
}

// The categories that still exist, each once.
function with_known_categories<Item extends { categories: string[] }>(item: Item, categories: Category[]): Item {
  return { ...item, categories: known_category_ids(item.categories, categories) };
}

// ── Inputs ───────────────────────────────────────────────────────────────────

// A picture is a data URL of an image, empty to remove it, or left out to keep the one stored.
export type ExerciseInput = Partial<Exercise> & { name: string; picture?: string };

// Big enough for a photo shrunk for a tile, small enough that syncing and history stay light.
const picture_limit = 1_000_000;

function normalize_picture(picture: string | undefined): string | undefined {
  if (picture === undefined || picture === "") return picture;
  if (!/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(picture)) throw new Error("A picture must be a data URL of an image, such as data:image/webp;base64,….");
  if (picture.length > picture_limit) throw new Error("The picture is too large; shrink it under 1 MB.");
  return picture;
}

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
  has_picture: boolean;
}

export interface WorkoutLibrary {
  exercises: LibraryExercise[];
  programs: Program[];
  // Every category in tree order, with its path.
  categories: PlacedCategory[];
  equipment: string[];
  muscles: string[];
}

export interface CategoryUsage extends PlacedCategory {
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
  // Every day of those weeks up to today, and the sets per category over them.
  days: DayActivity[];
  categories: CategorySets[];
  // Every exercise ever logged, newest first, with its last few sessions for a sparkline.
  bests: { exercise: Exercise; stats: ExerciseStats; trend: TrendPoint[] }[];
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
  in_transaction(database, () => {
    import_category_paths(database, workout_categories, document.categories);
    for (const exercise of document.exercises) {
      write_exercise(database, { ...exercise, categories: save_category_refs(database, workout_categories, exercise.categories) });
      summary.exercises += 1;
    }
    for (const program of document.programs) {
      if (!has_row(database, programs, eq(programs.id, program.id))) {
        drizzle_of(database).insert(programs).values({ id: program.id, name: program.name, notes: program.notes }).run();
        summary.programs += 1;
      }
      for (const session of program.sessions) {
        if (has_row(database, program_sessions, eq(program_sessions.id, session.id))) continue;
        insert_session(database, program.id, { ...session, categories: save_category_refs(database, workout_categories, session.categories) });
        session.entries.forEach((entry, position) =>
          write_session_entry(database, session.id, position, has_row(database, session_exercises, eq(session_exercises.id, entry.id)) ? { ...entry, id: new_id() } : entry),
        );
        summary.sessions += 1;
      }
    }
    for (const workout of document.workouts) {
      if (has_row(database, workouts, eq(workouts.id, workout.id))) {
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

export const workouts_feature = define_feature({
  id: "workouts",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(workout_tables),
  methods: {
    // ── Library ──

    get_workout_library: (database: SqlDatabase): WorkoutLibrary => {
      const categories = read_categories(database, workout_categories);
      const exercises = load_exercises(database).map((exercise) => with_known_categories(exercise, categories));
      const programs = load_programs(database).map((program) => ({ ...program, sessions: program.sessions.map((session) => with_known_categories(session, categories)) }));
      const done = drizzle_of(database)
        .select({ id: workout_exercises.exercise_id, date: max(workouts.date) })
        .from(workout_exercises)
        .innerJoin(workouts, eq(workouts.id, workout_exercises.workout_id))
        .groupBy(workout_exercises.exercise_id)
        .all();
      const last_done = new Map(done.map((row) => [row.id, row.date]));
      const pictured = pictured_exercise_ids(database);
      return {
        exercises: exercises.map((exercise) => ({ ...exercise, last_done: last_done.get(exercise.id) ?? null, has_picture: pictured.has(exercise.id) })),
        programs,
        categories: placed_categories(categories),
        equipment: normalize_names(exercises.map((exercise) => exercise.equipment)),
        muscles: normalize_names(exercises.flatMap((exercise) => exercise.muscles)),
      };
    },

    // A category given as a "/" path is found, or made where missing.
    save_exercise: (database: SqlDatabase, input: ExerciseInput): string => {
      const name = trimmed(input.name);
      if (!name) throw new Error("An exercise needs a name.");
      const exercise: Exercise = {
        id: input.id || new_id(),
        name,
        measurement: is_measurement(input.measurement) ? input.measurement : "weight",
        equipment: trimmed(input.equipment),
        muscles: normalize_names(input.muscles),
        categories: normalize_category_refs(input.categories),
        notes: trimmed(input.notes),
      };
      const picture = normalize_picture(input.picture);
      in_transaction(database, () => write_exercise(database, { ...exercise, categories: save_category_refs(database, workout_categories, exercise.categories) }, picture));
      return exercise.id;
    },

    get_exercise_picture: (database: SqlDatabase, id: string): string => {
      return drizzle_of(database).select({ picture: exercises.picture }).from(exercises).where(eq(exercises.id, id)).get()?.picture ?? "";
    },

    // Only the exercises that have one, by id.
    list_exercise_pictures: (database: SqlDatabase): Record<string, string> => {
      const rows = drizzle_of(database).select({ id: exercises.id, picture: exercises.picture }).from(exercises).where(ne(exercises.picture, "")).all();
      return Object.fromEntries(rows.map((row) => [row.id, row.picture]));
    },

    // Sessions and logged sets keep the id, and show it as a deleted exercise.
    delete_exercise: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(exercises).where(eq(exercises.id, id)).run();
    },

    search_wger_exercises: (_database: SqlDatabase, term: string): Promise<WgerResult[]> => search_wger(term),

    // Fetched here rather than by the page, since wger's pictures do not allow a page on another site to read them.
    lookup_wger_picture: (_database: SqlDatabase, wger_id: number): Promise<string> => wger_picture(wger_id),

    // ── Categories ──

    list_workout_categories: (database: SqlDatabase): CategoryUsage[] => {
      const categories = read_categories(database, workout_categories);
      const exercises = load_exercises(database);
      const sessions = load_sessions(database);
      const count = (items: { categories: string[] }[], id: string, tree: boolean) =>
        items.filter((item) => (tree ? is_in_category(item.categories, id, categories) : item.categories.includes(id))).length;
      return placed_categories(categories).map((category) => ({
        ...category,
        exercises: count(exercises, category.id, false),
        sessions: count(sessions, category.id, false),
        exercises_in_tree: count(exercises, category.id, true),
        sessions_in_tree: count(sessions, category.id, true),
      }));
    },

    add_workout_category: (database: SqlDatabase, name: string, parent_id: string | null = null): string => {
      return add_category(database, workout_categories, name, parent_id);
    },

    rename_workout_category: (database: SqlDatabase, id: string, name: string): void => {
      in_transaction(database, () => rename_category(database, workout_categories, id, name, retag(database)));
    },

    move_workout_category: (database: SqlDatabase, id: string, parent_id: string | null, position: number | null = null): void => {
      in_transaction(database, () => move_category(database, workout_categories, id, parent_id, position, retag(database)));
    },

    // Everything inside it goes too; the exercises and sessions are kept.
    delete_workout_category: (database: SqlDatabase, id: string): void => {
      in_transaction(database, () => delete_category(database, workout_categories, id, retag(database)));
    },

    // ── Programs ──

    save_program: (database: SqlDatabase, input: { id?: string; name: string; notes?: string }): string => {
      const name = trimmed(input.name);
      if (!name) throw new Error("A program needs a name.");
      const id = input.id || new_id();
      const fields = { name, notes: trimmed(input.notes) };
      drizzle_of(database)
        .insert(programs)
        .values({ id, ...fields })
        .onConflictDoUpdate({ target: programs.id, set: fields })
        .run();
      return id;
    },

    // Its sessions go with it; workouts logged from them stay.
    delete_program: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(programs).where(eq(programs.id, id)).run();
    },

    // Writes the session whole: its entries in the order given, dropping any no longer listed or naming no exercise.
    save_program_session: (database: SqlDatabase, program_id: string, input: SessionInput): string => {
      const name = trimmed(input.name);
      if (!name) throw new Error("A session needs a name.");
      const id = input.id || new_id();
      const entries = input.entries.filter((entry) => entry.exercise_id).map(normalize_entry);
      in_transaction(database, () => {
        const fields = { name, notes: trimmed(input.notes), categories: save_category_refs(database, workout_categories, input.categories) };
        const db = drizzle_of(database);
        if (has_row(database, program_sessions, eq(program_sessions.id, id))) {
          db.update(program_sessions)
            .set({ ...fields, categories: JSON.stringify(fields.categories) })
            .where(eq(program_sessions.id, id))
            .run();
        } else {
          insert_session(database, program_id, { id, ...fields });
        }
        const kept = new Set(entries.map((entry) => entry.id));
        const current = db.select({ id: session_exercises.id }).from(session_exercises).where(eq(session_exercises.session_id, id)).all();
        for (const row of current) if (!kept.has(row.id)) db.delete(session_exercises).where(eq(session_exercises.id, row.id)).run();
        entries.forEach((entry, position) => write_session_entry(database, id, position, entry));
      });
      return id;
    },

    delete_program_session: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(program_sessions).where(eq(program_sessions.id, id)).run();
    },

    // Swaps with its neighbour; the order is the order the program runs in.
    move_program_session: (database: SqlDatabase, id: string, delta: -1 | 1): void => {
      const db = drizzle_of(database);
      const row = db.select({ program_id: program_sessions.program_id }).from(program_sessions).where(eq(program_sessions.id, id)).get();
      if (!row) return;
      const ids = db
        .select({ id: program_sessions.id })
        .from(program_sessions)
        .where(eq(program_sessions.program_id, row.program_id))
        .orderBy(asc(program_sessions.position), rowid)
        .all()
        .map((item) => item.id);
      const index = ids.indexOf(id);
      const target = index + delta;
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      in_transaction(database, () => ids.forEach((session_id, position) => db.update(program_sessions).set({ position }).where(eq(program_sessions.id, session_id)).run()));
    },

    // ── Log ──

    list_workouts: (database: SqlDatabase, date: string): LoggedWorkout[] => {
      return load_workouts(database, eq(workouts.date, date)).map((workout) => ({
        ...workout,
        has_session: workout.session_id !== "" && has_row(database, program_sessions, eq(program_sessions.id, workout.session_id)),
      }));
    },

    // From a session, each of its exercises comes with its target sets already made; without one it starts empty.
    start_workout: (database: SqlDatabase, date: string, session_id: string | null, started_at: string): string => {
      const session = session_id ? find_session(database, session_id) : null;
      if (session_id && !session) throw new Error("That session no longer exists.");
      const program = session ? drizzle_of(database).select({ name: programs.name }).from(programs).where(eq(programs.id, session.program_id)).get() : undefined;
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
      const fields: Partial<typeof workouts.$inferInsert> = {};
      if (changes.name !== undefined) fields.name = changes.name;
      if (changes.notes !== undefined) fields.notes = changes.notes;
      if (changes.date) fields.date = changes.date;
      if (Object.keys(fields).length > 0) drizzle_of(database).update(workouts).set(fields).where(eq(workouts.id, id)).run();
    },

    delete_workout: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(workouts).where(eq(workouts.id, id)).run();
    },

    // Added mid-workout with one empty set and no target.
    add_workout_exercise: (database: SqlDatabase, workout_id: string, exercise_id: string): string => {
      const id = new_id();
      in_transaction(database, () => {
        insert_workout_entry(database, workout_id, next_position(database, workout_exercises, workout_exercises.position, eq(workout_exercises.workout_id, workout_id)), {
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
      drizzle_of(database).update(workout_exercises).set({ notes: changes.notes }).where(eq(workout_exercises.id, id)).run();
    },

    delete_workout_exercise: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(workout_exercises).where(eq(workout_exercises.id, id)).run();
    },

    // A new set copies the last one, since sets usually repeat the load.
    add_workout_set: (database: SqlDatabase, workout_exercise_id: string): string => {
      const last = drizzle_of(database)
        .select()
        .from(workout_sets)
        .where(eq(workout_sets.workout_exercise_id, workout_exercise_id))
        .orderBy(sql`${workout_sets.position} DESC, rowid DESC`)
        .limit(1)
        .get();
      const id = new_id();
      const values = last ? to_set(last) : { reps: 0, weight: 0, duration: 0, distance: 0, rpe: 0 };
      insert_set(database, workout_exercise_id, next_position(database, workout_sets, workout_sets.position, eq(workout_sets.workout_exercise_id, workout_exercise_id)), { ...values, id });
      return id;
    },

    update_workout_set: (database: SqlDatabase, id: string, changes: Partial<SetValues & { rpe: number }>): void => {
      const columns = { reps: "reps", weight: "weight_kg", duration: "duration_s", distance: "distance_km", rpe: "rpe" } as const;
      const fields: Partial<typeof workout_sets.$inferInsert> = {};
      for (const [key, column] of Object.entries(columns)) {
        const value = changes[key as keyof typeof columns];
        if (value !== undefined) fields[column] = non_negative(value);
      }
      if (Object.keys(fields).length > 0) drizzle_of(database).update(workout_sets).set(fields).where(eq(workout_sets.id, id)).run();
    },

    delete_workout_set: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(workout_sets).where(eq(workout_sets.id, id)).run();
    },

    // Runs the session's progressions against the targets the workout started with, rewrites the session's targets, and marks it finished; once only.
    finish_workout: (database: SqlDatabase, id: string, finished_at: string): ProgressionReport[] => {
      const workout = load_workouts(database, eq(workouts.id, id))[0];
      if (!workout || workout.finished_at) return [];
      return in_transaction(database, () => {
        drizzle_of(database).update(workouts).set({ finished_at }).where(eq(workouts.id, id)).run();
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
        .map((exercise) => {
          const history = exercise_history(workouts, exercise.id);
          return { exercise, stats: exercise_stats(history, exercise.measurement), trend: exercise_trend(history, exercise.measurement).slice(-12) };
        })
        .filter((item) => item.stats.workouts > 0);
      const weeks = weekly_totals(workouts, measurement_map(exercises), options.weeks, options.today, options.week_start);
      const first = weeks[0]?.week_start ?? options.today;
      return {
        weeks,
        days: daily_activity(workouts, first, options.today),
        categories: category_sets(workouts, exercises, read_categories(database, workout_categories), first, options.today),
        leaders: leaderboards.map((board) => ({
          ...board,
          rows: leaderboard(ranked, board.key).map((item) => ({ exercise_id: item.exercise.id, name: item.exercise.name, value: item.stats[board.key] })),
        })),
        bests: [...ranked].sort((first, second) => (second.stats.last_done ?? "").localeCompare(first.stats.last_done ?? "")),
      };
    },

    get_exercise_report: (database: SqlDatabase, exercise_id: string): ExerciseReport | null => {
      const exercise = find_exercise(database, exercise_id);
      if (!exercise) return null;
      const logged_in = drizzle_of(database).select({ id: workout_exercises.workout_id }).from(workout_exercises).where(eq(workout_exercises.exercise_id, exercise_id));
      const history = exercise_history(load_workouts(database, inArray(workouts.id, logged_in)), exercise_id);
      return { exercise, stats: exercise_stats(history, exercise.measurement), trend: exercise_trend(history, exercise.measurement), history };
    },

    // ── Import and export ──

    // The whole of it in the Trilium add-on's shape, in kg, km and minutes.
    export_workouts: (database: SqlDatabase): string => {
      const categories = read_categories(database, workout_categories);
      const as_paths = <Item extends { categories: string[] }>(item: Item): Item => ({ ...item, categories: category_paths_of(known_category_ids(item.categories, categories), categories) });
      const exercises = load_exercises(database).map(as_paths);
      const programs = load_programs(database).map((program) => ({ ...program, sessions: program.sessions.map(as_paths) }));
      return write_trilium_database({ categories: category_paths_of(categories.map((category) => category.id), categories), exercises, programs, workouts: load_workouts(database) });
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
  api: workouts_api,
  setting_defaults: workout_setting_defaults,
});
