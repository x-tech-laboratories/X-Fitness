// The workouts tables, from which drizzle-kit writes the migrations and the store reads its row types.

// ── Imports ──────────────────────────────────────────────────────────────────

import { index, integer, real, sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

// Exercise ids are kept without a foreign key, so deleting an exercise leaves the sessions and log that used it alone.

export const workout_categories = sqliteTable("workout_categories", {
  name: text().primaryKey(),
});

export const exercises = sqliteTable("exercises", {
  id: text().primaryKey(),
  name: text().notNull().default(""),
  measurement: text().notNull().default("weight"),
  equipment: text().notNull().default(""),
  muscles: text().notNull().default("[]"),
  categories: text().notNull().default("[]"),
  notes: text().notNull().default(""),
});

export const programs = sqliteTable("programs", {
  id: text().primaryKey(),
  name: text().notNull().default(""),
  notes: text().notNull().default(""),
});

export const program_sessions = sqliteTable(
  "program_sessions",
  {
    id: text().primaryKey(),
    program_id: text()
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    name: text().notNull().default(""),
    notes: text().notNull().default(""),
    categories: text().notNull().default("[]"),
  },
  (table) => [index("program_sessions_by_program").on(table.program_id)],
);

export const session_exercises = sqliteTable(
  "session_exercises",
  {
    id: text().primaryKey(),
    session_id: text()
      .notNull()
      .references(() => program_sessions.id, { onDelete: "cascade" }),
    exercise_id: text().notNull().default(""),
    position: integer().notNull().default(0),
    sets: real().notNull().default(3),
    reps: real().notNull().default(0),
    weight_kg: real().notNull().default(0),
    duration_s: real().notNull().default(0),
    distance_km: real().notNull().default(0),
    rest_s: real().notNull().default(0),
    notes: text().notNull().default(""),
    progression_type: text().notNull().default("none"),
    increment: real().notNull().default(0),
    increment_percent: integer().notNull().default(0),
    successes: real().notNull().default(1),
    success_counter: real().notNull().default(0),
    decrement: real().notNull().default(0),
    decrement_percent: integer().notNull().default(0),
    failures: real().notNull().default(1),
    failure_counter: real().notNull().default(0),
    min_reps: real().notNull().default(0),
    max_reps: real().notNull().default(0),
    reps_threshold: real().notNull().default(0),
  },
  (table) => [index("session_exercises_by_session").on(table.session_id)],
);

export const workouts = sqliteTable(
  "workouts",
  {
    id: text().primaryKey(),
    date: text().notNull(),
    name: text().notNull().default("Workout"),
    session_id: text().notNull().default(""),
    started_at: text().notNull().default(""),
    finished_at: text().notNull().default(""),
    notes: text().notNull().default(""),
  },
  (table) => [index("workouts_by_date").on(table.date)],
);

export const workout_exercises = sqliteTable(
  "workout_exercises",
  {
    id: text().primaryKey(),
    workout_id: text()
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exercise_id: text().notNull().default(""),
    session_entry_id: text().notNull().default(""),
    position: integer().notNull().default(0),
    notes: text().notNull().default(""),
    target_sets: real().notNull().default(0),
    target_reps: real().notNull().default(0),
    target_weight_kg: real().notNull().default(0),
    target_duration_s: real().notNull().default(0),
    target_distance_km: real().notNull().default(0),
    target_rest_s: real().notNull().default(0),
  },
  (table) => [index("workout_exercises_by_workout").on(table.workout_id)],
);

export const workout_sets = sqliteTable(
  "workout_sets",
  {
    id: text().primaryKey(),
    workout_exercise_id: text()
      .notNull()
      .references(() => workout_exercises.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    reps: real().notNull().default(0),
    weight_kg: real().notNull().default(0),
    duration_s: real().notNull().default(0),
    distance_km: real().notNull().default(0),
    rpe: real().notNull().default(0),
  },
  (table) => [index("workout_sets_by_entry").on(table.workout_exercise_id)],
);

// Parents first, as sync applies them.
export const workout_tables = [workout_categories, exercises, programs, program_sessions, session_exercises, workouts, workout_exercises, workout_sets];
