// The Trilium add-on Workout Manager's database.json, read in and written out: categories, an exercises map, a programs
// map whose sessions hold their exercises, and a log of workouts by day. The add-on labelled its numbers with the units
// set in it rather than converting them, so a file is read in the units it was kept in; durations there are minutes.

// ── Imports ──────────────────────────────────────────────────────────────────

import { to_stored, type DistanceUnit, type MassUnit } from "@x-tech-laboratories/x-libs/units";

import { new_id } from "../feature.ts";
import {
  is_measurement,
  non_negative,
  normalize_categories,
  normalize_names,
  normalize_progression,
  positive,
  trimmed,
  type Exercise,
  type LoggedSet,
  type Program,
  type Session,
  type SessionEntry,
  type Target,
  type Workout,
  type WorkoutEntry,
  type WorkoutsDocument,
} from "./model.ts";

// ── Units ────────────────────────────────────────────────────────────────────

export interface FileUnits {
  mass_unit: MassUnit;
  distance_unit: DistanceUnit;
}

// A converter from the file's numbers to stored ones, and back.
interface Scale {
  weight: (value: unknown) => number;
  distance: (value: unknown) => number;
  duration: (value: unknown) => number;
}

function scale_in(units: FileUnits): Scale {
  return {
    weight: (value) => to_stored(non_negative(value), units.mass_unit),
    distance: (value) => to_stored(non_negative(value), units.distance_unit),
    duration: (value) => non_negative(value) * 60,
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function as_raw(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function as_list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(as_raw) : [];
}

function id_of(raw: Raw): string {
  return typeof raw.id === "string" && raw.id ? raw.id : new_id();
}

function read_exercise(raw: Raw, id: string): Exercise {
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "",
    measurement: is_measurement(raw.measurement) ? raw.measurement : "weight",
    equipment: trimmed(raw.equipment),
    muscles: normalize_names(raw.muscles),
    categories: normalize_categories(raw.tags),
    notes: trimmed(raw.comment),
  };
}

function read_progression(raw: Raw, scale: Scale): SessionEntry["progression"] {
  const increment_percent = raw.incrementPercent === true;
  const decrement_percent = raw.decrementPercent === true;
  return normalize_progression({
    type: raw.type as SessionEntry["progression"]["type"],
    increment: increment_percent ? non_negative(raw.increment) : scale.weight(raw.increment),
    increment_percent,
    successes: positive(raw.successes, 1),
    success_counter: non_negative(raw.successCounter),
    decrement: decrement_percent ? non_negative(raw.decrement) : scale.weight(raw.decrement),
    decrement_percent,
    failures: positive(raw.failures, 1),
    failure_counter: non_negative(raw.failureCounter),
    min_reps: non_negative(raw.minReps),
    max_reps: non_negative(raw.maxReps),
    reps_threshold: non_negative(raw.repsThreshold),
  });
}

function read_session(raw: Raw, program_id: string, scale: Scale, id = id_of(raw)): Session {
  return {
    id,
    program_id,
    name: typeof raw.name === "string" ? raw.name : "",
    notes: trimmed(raw.comment),
    categories: normalize_categories(raw.tags),
    entries: as_list(raw.entries).map((entry) => ({
      id: id_of(entry),
      exercise_id: typeof entry.exerciseId === "string" ? entry.exerciseId : "",
      sets: positive(entry.sets, 3),
      reps: non_negative(entry.reps),
      weight: scale.weight(entry.weight),
      duration: scale.duration(entry.duration),
      distance: scale.distance(entry.distance),
      rest: non_negative(entry.rest),
      notes: trimmed(entry.comment),
      progression: read_progression(as_raw(entry.progression), scale),
    })),
  };
}

function read_target(raw: Raw, scale: Scale): Target {
  return {
    sets: non_negative(raw.sets),
    reps: non_negative(raw.reps),
    weight: scale.weight(raw.weight),
    duration: scale.duration(raw.duration),
    distance: scale.distance(raw.distance),
    rest: non_negative(raw.rest),
  };
}

function read_set(raw: Raw, scale: Scale): LoggedSet {
  return {
    id: id_of(raw),
    reps: non_negative(raw.reps),
    weight: scale.weight(raw.weight),
    duration: scale.duration(raw.duration),
    distance: scale.distance(raw.distance),
    rpe: non_negative(raw.rpe),
  };
}

function read_workout(raw: Raw, date: string, scale: Scale): Workout {
  const entries: WorkoutEntry[] = as_list(raw.entries).map((entry) => ({
    id: id_of(entry),
    exercise_id: typeof entry.exerciseId === "string" ? entry.exerciseId : "",
    session_entry_id: typeof entry.sessionEntryId === "string" ? entry.sessionEntryId : "",
    target: read_target(as_raw(entry.target), scale),
    notes: trimmed(entry.comment),
    sets: as_list(entry.sets).map((set) => read_set(set, scale)),
  }));
  // Files from before programs named the session routineId.
  const session_id = typeof raw.sessionId === "string" ? raw.sessionId : typeof raw.routineId === "string" ? raw.routineId : "";
  return {
    id: id_of(raw),
    date,
    name: typeof raw.name === "string" ? raw.name : "Workout",
    session_id,
    started_at: typeof raw.startedAt === "string" ? raw.startedAt : `${date}T00:00:00.000Z`,
    finished_at: typeof raw.finishedAt === "string" ? raw.finishedAt : "",
    notes: trimmed(raw.comment),
    entries,
  };
}

// Files from before programs held a flat routines map; each routine becomes a session of one program named Imported.
const imported_program_id = "imported";

function read_routines(parsed: Raw, scale: Scale): Program | null {
  const routines = as_raw(parsed.routines);
  const sessions = Object.entries(routines).map(([id, routine]) => read_session(as_raw(routine), imported_program_id, scale, id));
  return sessions.length > 0 ? { id: imported_program_id, name: "Imported", notes: "", sessions } : null;
}

// Throws on anything that is not recognisably the add-on's database, so nothing is merged from it.
export function read_trilium_database(text: string, units: FileUnits): WorkoutsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object with exercises, programs and log.");
  const document = parsed as Raw;
  // A file this app exported says which units it holds.
  const file_units = as_raw(document.units);
  const scale = scale_in({
    mass_unit: file_units.weight === "kg" || file_units.weight === "lb" ? file_units.weight : units.mass_unit,
    distance_unit: file_units.distance === "km" || file_units.distance === "mi" ? file_units.distance : units.distance_unit,
  });

  const exercises = Object.entries(as_raw(document.exercises)).map(([id, exercise]) => read_exercise(as_raw(exercise), id));
  const programs = Object.entries(as_raw(document.programs)).map(([id, raw]): Program => {
    const program = as_raw(raw);
    return { id, name: typeof program.name === "string" ? program.name : "", notes: trimmed(program.comment), sessions: as_list(program.sessions).map((session) => read_session(session, id, scale)) };
  });
  const migrated = read_routines(document, scale);
  if (migrated) {
    const existing = programs.find((program) => program.id === migrated.id);
    if (existing) existing.sessions.push(...migrated.sessions);
    else programs.push(migrated);
  }
  const workouts = Object.entries(as_raw(document.log)).flatMap(([date, list]) => (Array.isArray(list) ? as_list(list).map((workout) => read_workout(workout, date, scale)) : []));
  return { categories: normalize_categories(document.categories), exercises, programs, workouts };
}

// ── Writing ──────────────────────────────────────────────────────────────────

// The same shape the add-on keeps, in kg, km and minutes, naming those units so reading it back converts nothing.
export function write_trilium_database(document: WorkoutsDocument): string {
  const weight = (value: number) => Number(value.toFixed(3));
  const minutes = (seconds: number) => Number((seconds / 60).toFixed(3));
  const set_numbers = (values: { reps: number; weight: number; duration: number; distance: number }) => ({
    reps: values.reps,
    weight: weight(values.weight),
    duration: minutes(values.duration),
    distance: values.distance,
  });
  const log: Record<string, unknown[]> = {};
  for (const workout of document.workouts) {
    (log[workout.date] ??= []).push({
      id: workout.id,
      name: workout.name,
      sessionId: workout.session_id,
      startedAt: workout.started_at,
      finishedAt: workout.finished_at,
      comment: workout.notes,
      entries: workout.entries.map((entry) => ({
        id: entry.id,
        exerciseId: entry.exercise_id,
        sessionEntryId: entry.session_entry_id,
        target: { sets: entry.target.sets, ...set_numbers(entry.target), rest: entry.target.rest },
        comment: entry.notes,
        sets: entry.sets.map((set) => ({ id: set.id, ...set_numbers(set), rpe: set.rpe })),
      })),
    });
  }
  return JSON.stringify(
    {
      units: { weight: "kg", distance: "km" },
      categories: document.categories,
      exercises: Object.fromEntries(
        document.exercises.map((exercise) => [
          exercise.id,
          { id: exercise.id, name: exercise.name, measurement: exercise.measurement, equipment: exercise.equipment, muscles: exercise.muscles, comment: exercise.notes, tags: exercise.categories },
        ]),
      ),
      programs: Object.fromEntries(
        document.programs.map((program) => [
          program.id,
          {
            id: program.id,
            name: program.name,
            comment: program.notes,
            sessions: program.sessions.map((session) => ({
              id: session.id,
              name: session.name,
              comment: session.notes,
              tags: session.categories,
              entries: session.entries.map((entry) => ({
                id: entry.id,
                exerciseId: entry.exercise_id,
                sets: entry.sets,
                ...set_numbers(entry),
                rest: entry.rest,
                comment: entry.notes,
                progression: {
                  type: entry.progression.type,
                  increment: entry.progression.increment_percent ? entry.progression.increment : weight(entry.progression.increment),
                  incrementPercent: entry.progression.increment_percent,
                  successes: entry.progression.successes,
                  successCounter: entry.progression.success_counter,
                  decrement: entry.progression.decrement_percent ? entry.progression.decrement : weight(entry.progression.decrement),
                  decrementPercent: entry.progression.decrement_percent,
                  failures: entry.progression.failures,
                  failureCounter: entry.progression.failure_counter,
                  minReps: entry.progression.min_reps,
                  maxReps: entry.progression.max_reps,
                  repsThreshold: entry.progression.reps_threshold,
                },
              })),
            })),
          },
        ]),
      ),
      log,
    },
    null,
    4,
  );
}
