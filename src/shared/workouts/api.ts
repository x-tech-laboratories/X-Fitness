// The workout calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema, MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { categories, day, id_of, json_file, moment, number, step, text } from "../api_schemas.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const set_values = {
  reps: { type: "integer", minimum: 0 },
  weight: number("In kg."),
  duration: number("In seconds."),
  distance: number("In km."),
};

const progression: JsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["none", "linear", "double", "sum"], description: "How the targets move after each finished workout." },
    increment: number("The step up, in kg or percent."),
    increment_percent: { type: "boolean" },
    successes: { type: "integer", description: "For linear: successful workouts before stepping up." },
    decrement: number("The step down, in kg or percent."),
    decrement_percent: { type: "boolean" },
    failures: { type: "integer", description: "For linear: failed workouts before stepping down." },
    min_reps: { type: "integer", description: "For double: the bottom of the rep range." },
    max_reps: { type: "integer", description: "For double: the top of the rep range, where the weight steps up." },
    reps_threshold: { type: "integer", description: "For sum: the total reps that earn a step up." },
  },
};

const session_entry: JsonSchema = {
  type: "object",
  properties: {
    id: text("The entry's id when keeping one; leave out to add one."),
    exercise_id: id_of("exercise"),
    sets: { type: "integer", minimum: 0, description: "How many sets." },
    ...set_values,
    rest: number("Seconds of rest between sets."),
    notes: text("A note."),
    progression,
  },
  required: ["exercise_id"],
};

const category_name = text('The category path, such as "Legs/Quads".');

// ── Calls ────────────────────────────────────────────────────────────────────

export const workouts_api = {
  get_workout_library: {
    description: "Every exercise with when it was last done, every program with its sessions and their exercises' targets, and the category, equipment and muscle lists.",
    params: [],
  },
  save_exercise: {
    description: "Adds an exercise, or replaces the one with the id given. Gives back its id.",
    params: [
      {
        name: "exercise",
        schema: {
          type: "object",
          properties: {
            id: text("The exercise's id when replacing it; leave out to add one."),
            name: text("The name."),
            measurement: { type: "string", enum: ["weight", "bodyweight", "duration", "cardio"], description: "Which fields its sets carry: weight and reps, reps, duration, or duration and distance." },
            equipment: text("Such as Barbell."),
            muscles: { type: "array", items: { type: "string" } },
            categories,
            notes: text("A note."),
          },
          required: ["name"],
        },
      },
    ],
  },
  delete_exercise: { description: "Deletes an exercise; sessions and logged sets naming it show it as deleted.", params: [{ name: "id", schema: id_of("exercise") }] },
  search_wger_exercises: {
    description: "Searches the public wger exercise database by name, for exercises to add with save_exercise.",
    params: [{ name: "term", schema: text("Part of the exercise's name.") }],
  },
  list_workout_categories: { description: "Every workout category with how many exercises and sessions use it, directly and through its subcategories.", params: [] },
  add_workout_category: { description: "Adds a workout category.", params: [{ name: "name", schema: category_name }] },
  rename_workout_category: {
    description: "Renames a workout category with its subcategories everywhere; a name already in use merges the two.",
    params: [{ name: "from", schema: category_name }, { name: "to", schema: category_name }],
  },
  delete_workout_category: {
    description: "Deletes a workout category and its subcategories; the exercises and sessions stay, untagged.",
    params: [{ name: "name", schema: category_name }],
  },
  save_program: {
    description: "Adds a program, or renames the one with the id given. Gives back its id.",
    params: [
      {
        name: "program",
        schema: { type: "object", properties: { id: text("The program's id when changing it."), name: text("The name."), notes: text("A note.") }, required: ["name"] },
      },
    ],
  },
  delete_program: { description: "Deletes a program and its sessions; workouts logged from them stay.", params: [{ name: "id", schema: id_of("program") }] },
  save_program_session: {
    description: "Adds a session to a program, or rewrites the one with the id given whole: its exercises in the order given, dropping any not listed. Gives back its id.",
    params: [
      { name: "program_id", schema: id_of("program") },
      {
        name: "session",
        schema: {
          type: "object",
          properties: { id: text("The session's id when rewriting it."), name: text("The name."), notes: text("A note."), categories, entries: { type: "array", items: session_entry } },
          required: ["name", "entries"],
        },
      },
    ],
  },
  delete_program_session: { description: "Deletes a session from its program.", params: [{ name: "id", schema: id_of("session") }] },
  move_program_session: { description: "Moves a session one place in its program's order.", params: [{ name: "id", schema: id_of("session") }, { name: "delta", schema: step }] },
  list_workouts: { description: "The workouts logged on a day, each with its exercises, targets and sets.", params: [{ name: "date", schema: day }] },
  start_workout: {
    description: "Starts a workout on a day, from a program session with its target sets already made, or empty. Gives back its id.",
    params: [
      { name: "date", schema: day },
      { name: "session_id", schema: { type: ["string", "null"], description: "The session to follow; null for an empty workout." } },
      { name: "started_at", schema: moment },
    ],
  },
  update_workout: {
    description: "Changes a workout's name, notes or day; only the fields given change.",
    params: [{ name: "id", schema: id_of("workout") }, { name: "changes", schema: { type: "object", properties: { name: text("The name."), notes: text("A note."), date: day } } }],
  },
  delete_workout: { description: "Deletes a logged workout.", params: [{ name: "id", schema: id_of("workout") }] },
  add_workout_exercise: {
    description: "Adds an exercise to a workout with one empty set. Gives back the workout exercise's id, which sets are added to.",
    params: [{ name: "workout_id", schema: id_of("workout") }, { name: "exercise_id", schema: id_of("exercise") }],
  },
  update_workout_exercise: {
    description: "Sets the notes of an exercise in a workout.",
    params: [{ name: "id", schema: id_of("workout exercise") }, { name: "changes", schema: { type: "object", properties: { notes: text("The notes.") }, required: ["notes"] } }],
  },
  delete_workout_exercise: { description: "Removes an exercise and its sets from a workout.", params: [{ name: "id", schema: id_of("workout exercise") }] },
  add_workout_set: {
    description: "Adds a set to an exercise in a workout, copying the last set. Gives back the set's id.",
    params: [{ name: "workout_exercise_id", schema: id_of("workout exercise") }],
  },
  update_workout_set: {
    description: "Changes a logged set; only the fields given change.",
    params: [{ name: "id", schema: id_of("set") }, { name: "changes", schema: { type: "object", properties: { ...set_values, rpe: number("Effort from 1 to 10; 0 for none.") } } }],
  },
  delete_workout_set: { description: "Deletes a logged set.", params: [{ name: "id", schema: id_of("set") }] },
  finish_workout: {
    description: "Marks a workout finished and runs its session's progressions, moving the session's targets. Gives back what changed; finishing twice does nothing.",
    params: [{ name: "id", schema: id_of("workout") }, { name: "finished_at", schema: moment }],
  },
  get_workout_report: {
    description: "Weekly totals, leaderboards and each exercise's bests over the weeks ending today.",
    params: [
      {
        name: "options",
        schema: {
          type: "object",
          properties: {
            weeks: { type: "integer", minimum: 1, description: "How many weeks back." },
            today: day,
            week_start: { type: "integer", minimum: 0, maximum: 6, description: "The day a week starts on, 0 for Sunday and 1 for Monday." },
          },
          required: ["weeks", "today", "week_start"],
        },
      },
    ],
  },
  get_exercise_report: { description: "One exercise's statistics, trend and every logged set; null when it does not exist.", params: [{ name: "exercise_id", schema: id_of("exercise") }] },
  export_workouts: { description: "Every exercise, program and workout as JSON in the Trilium workouts add-on's format, in kg, km and minutes.", params: [] },
  import_trilium_workouts: {
    description: "Merges a Trilium workouts add-on database.json by id.",
    params: [
      { name: "json_text", schema: json_file },
      {
        name: "units",
        optional: true,
        schema: {
          type: "object",
          properties: { mass_unit: { type: "string", enum: ["kg", "lb"] }, distance_unit: { type: "string", enum: ["km", "mi"] } },
          required: ["mass_unit", "distance_unit"],
          description: "The units the file's numbers are in; kg and km unless given.",
        },
      },
    ],
  },
  import_liftosaur_workouts: { description: "Merges a Liftosaur JSON backup or history CSV.", params: [{ name: "text", schema: json_file }] },
} satisfies Record<string, MethodSpec>;
