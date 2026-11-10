import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { bind_methods, open_store, setting_defaults, sync_engine } from "../src/shared/store.ts";
import { normalize_progression, type LoggedSet, type Target } from "../src/shared/workouts/model.ts";
import { evaluate_progression, step_weight } from "../src/shared/workouts/progression.ts";
import { week_start_day } from "../src/shared/workouts/reports.ts";
import { workouts_feature } from "../src/shared/workouts/store.ts";
import { forget_wger_index } from "../src/shared/workouts/wger.ts";

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, store: bind_methods(() => database, () => undefined) };
}

const started = "2026-11-10T09:00:00.000Z";

function sets(...values: [reps: number, weight: number][]): LoggedSet[] {
  return values.map(([reps, weight], index) => ({ id: String(index), reps, weight, duration: 0, distance: 0, rpe: 0 }));
}

function target(sets_count: number, reps: number, weight: number): Target {
  return { sets: sets_count, reps, weight, duration: 0, distance: 0, rest: 90 };
}

// A program with one session of bench press, 3 x 5 at 60 kg, progressing linearly by 2.5 kg after two successes.
function plan(store: ReturnType<typeof open_methods>["store"]) {
  const bench = store.save_exercise({ name: "Bench Press", measurement: "weight", categories: ["Push/Chest"] });
  const plank = store.save_exercise({ name: "Plank", measurement: "duration" });
  const program = store.save_program({ name: "PPL" });
  const session = store.save_program_session(program, {
    name: "Push",
    categories: ["Push"],
    entries: [
      { exercise_id: bench, sets: 3, reps: 5, weight: 60, rest: 120, progression: { type: "linear", increment: 2.5, successes: 2 } },
      { exercise_id: plank, sets: 2, duration: 60 },
    ],
  });
  return { bench, plank, program, session };
}

afterEach(() => {
  vi.unstubAllGlobals();
  forget_wger_index();
});

describe("workouts store", () => {
  it("syncs every table, parents first, and namespaces its settings", () => {
    const names = workouts_feature.tables.map((table) => table.name);
    expect(names.indexOf("programs")).toBeLessThan(names.indexOf("program_sessions"));
    expect(names.indexOf("program_sessions")).toBeLessThan(names.indexOf("session_exercises"));
    expect(names.indexOf("workouts")).toBeLessThan(names.indexOf("workout_exercises"));
    expect(names.indexOf("workout_exercises")).toBeLessThan(names.indexOf("workout_sets"));
    expect(setting_defaults).toMatchObject({ "workouts.default_rest": 90, "workouts.rest_sound": true, "workouts.weekly_target": 3 });
    const { database, store } = open_methods();
    plan(store);
    expect(sync_engine.collect_snapshot(database).changes.some((change) => change.table === "session_exercises")).toBe(true);
  });

  it("keeps the library with categories in use, their parents, equipment, muscles and when each was last done", () => {
    const { store } = open_methods();
    const squat = store.save_exercise({ name: " Squat ", equipment: "Barbell", muscles: ["Quads", "quads", "Glutes"], categories: ["Legs/Quads"], notes: "Low bar" });
    store.add_workout_category("Cardio");
    const workout = store.start_workout("2026-11-09", null, started);
    store.add_workout_exercise(workout, squat);
    const library = store.get_workout_library();
    expect(library.exercises).toEqual([{ id: squat, name: "Squat", measurement: "weight", equipment: "Barbell", muscles: ["Glutes", "Quads"], categories: ["Legs/Quads"], notes: "Low bar", last_done: "2026-11-09" }]);
    expect(library.categories).toEqual(["Cardio", "Legs", "Legs/Quads"]);
    expect(library.equipment).toEqual(["Barbell"]);
    expect(() => store.save_exercise({ name: "  " })).toThrow("needs a name");
  });

  it("renames a category with its subtree, merges onto an existing one, and deletes a subtree keeping the items", () => {
    const { store } = open_methods();
    const fly = store.save_exercise({ name: "Fly", categories: ["Push/Chest"] });
    const dip = store.save_exercise({ name: "Dip", categories: ["Upper/Chest"] });
    store.add_workout_category("Push/Chest/Inner");
    store.rename_workout_category("Push", "Upper");
    let usage = store.list_workout_categories();
    expect(usage.map((item) => item.name)).toEqual(["Upper", "Upper/Chest", "Upper/Chest/Inner"]);
    expect(usage.find((item) => item.name === "Upper")).toMatchObject({ exercises: 0, exercises_in_tree: 2, depth: 0, leaf: "Upper" });
    store.delete_workout_category("Upper/Chest");
    usage = store.list_workout_categories();
    expect(usage.map((item) => item.name)).toEqual([]);
    expect(store.get_workout_library().exercises.map((exercise) => [exercise.id, exercise.categories])).toEqual([
      [dip, []],
      [fly, []],
    ]);
  });

  it("keeps a session's exercises in order, drops empty ones, and moves sessions within their program", () => {
    const { store } = open_methods();
    const { program, session, bench } = plan(store);
    const pull = store.save_program_session(program, { name: "Pull", entries: [{ exercise_id: "" }] });
    let sessions = store.get_workout_library().programs[0]!.sessions;
    expect(sessions.map((item) => item.name)).toEqual(["Push", "Pull"]);
    expect(sessions[1]!.entries).toEqual([]);
    expect(sessions[0]!.entries[0]).toMatchObject({ exercise_id: bench, sets: 3, reps: 5, weight: 60, rest: 120, progression: { type: "linear", increment: 2.5, successes: 2 } });
    store.move_program_session(pull, -1);
    sessions = store.get_workout_library().programs[0]!.sessions;
    expect(sessions.map((item) => item.id)).toEqual([pull, session]);
    store.delete_program(program);
    expect(store.get_workout_library().programs).toEqual([]);
  });

  it("starts a workout from a session with its targets and sets filled in, named after both", () => {
    const { store } = open_methods();
    const { session, bench, plank } = plan(store);
    const id = store.start_workout("2026-11-10", session, started);
    const [workout] = store.list_workouts("2026-11-10");
    expect(workout).toMatchObject({ id, name: "PPL - Push", session_id: session, has_session: true, finished_at: "" });
    expect(workout!.entries.map((entry) => [entry.exercise_id, entry.sets.length])).toEqual([
      [bench, 3],
      [plank, 2],
    ]);
    expect(workout!.entries[0]!.sets[0]).toMatchObject({ reps: 5, weight: 60 });
    expect(workout!.entries[0]!.target).toEqual({ sets: 3, reps: 5, weight: 60, duration: 0, distance: 0, rest: 120 });
    expect(workout!.entries[1]!.sets[0]).toMatchObject({ duration: 60 });
  });

  it("logs sets: a new set copies the last, edits are saved, and a deleted exercise stays in the log", () => {
    const { store } = open_methods();
    const curl = store.save_exercise({ name: "Curl" });
    const workout = store.start_workout("2026-11-10", null, started);
    const entry = store.add_workout_exercise(workout, curl);
    const first = store.list_workouts("2026-11-10")[0]!.entries[0]!.sets[0]!;
    store.update_workout_set(first.id, { reps: 10, weight: 12.5, rpe: 8 });
    store.add_workout_set(entry);
    store.update_workout_exercise(entry, { notes: "slow" });
    store.update_workout(workout, { name: "Arms", notes: "good" });
    let logged = store.list_workouts("2026-11-10")[0]!;
    expect(logged).toMatchObject({ name: "Arms", notes: "good", has_session: false });
    expect(logged.entries[0]!.notes).toBe("slow");
    expect(logged.entries[0]!.sets.map((set) => [set.reps, set.weight, set.rpe])).toEqual([
      [10, 12.5, 8],
      [10, 12.5, 8],
    ]);
    store.delete_workout_set(logged.entries[0]!.sets[1]!.id);
    store.delete_exercise(curl);
    logged = store.list_workouts("2026-11-10")[0]!;
    expect(logged.entries[0]).toMatchObject({ exercise_id: curl });
    expect(logged.entries[0]!.sets).toHaveLength(1);
    store.delete_workout(workout);
    expect(store.list_workouts("2026-11-10")).toEqual([]);
  });

  it("finishes a workout once, progressing against the targets it started with", () => {
    const { store } = open_methods();
    const { session, bench } = plan(store);
    const first = store.start_workout("2026-11-10", session, started);
    expect(store.finish_workout(first, "2026-11-10T10:00:00.000Z")).toEqual([
      { entry_id: expect.any(String), exercise_id: bench, exercise_name: "Bench Press", outcome: "hold", counter: "1/2 successes", from: { reps: 5, weight: 60 }, to: { reps: 5, weight: 60 } },
    ]);
    expect(store.finish_workout(first, "2026-11-10T11:00:00.000Z")).toEqual([]);

    const second = store.start_workout("2026-11-12", session, started);
    // Logged heavier than planned, so the increase goes on what was lifted.
    const entry = store.list_workouts("2026-11-12")[0]!.entries[0]!;
    for (const set of entry.sets) store.update_workout_set(set.id, { weight: 62 });
    const [report] = store.finish_workout(second, "2026-11-12T10:00:00.000Z");
    expect(report).toMatchObject({ outcome: "increase", from: { weight: 60 }, to: { weight: 64.5 } });
    const planned = store.get_workout_library().programs[0]!.sessions[0]!.entries[0]!;
    expect(planned).toMatchObject({ weight: 64.5, progression: { success_counter: 0 } });
    expect(store.list_workouts("2026-11-12")[0]!.finished_at).toBe("2026-11-12T10:00:00.000Z");
  });

  it("evaluates linear, double and sum progressions as Liftosaur does", () => {
    const linear = normalize_progression({ type: "linear", increment: 5, increment_percent: true, decrement: 10, decrement_percent: true, failures: 2 });
    const missed = evaluate_progression(linear, target(3, 5, 100), sets([5, 100], [4, 100], [5, 100]));
    expect(missed).toMatchObject({ outcome: "hold", counter: "1/2 failures" });
    expect(evaluate_progression(missed.progression, target(3, 5, 100), sets([3, 100]))).toMatchObject({ outcome: "decrease", changes: { weight: 90 } });
    expect(evaluate_progression(linear, target(3, 5, 100), sets([5, 100], [5, 100], [6, 100]))).toMatchObject({ outcome: "increase", changes: { weight: 105 } });

    const double = normalize_progression({ type: "double", increment: 2.5, min_reps: 8, max_reps: 10 });
    expect(evaluate_progression(double, target(3, 8, 40), sets([9, 40], [8, 40], [9, 40]))).toMatchObject({ outcome: "reps", changes: { reps: 9 } });
    expect(evaluate_progression(double, target(3, 10, 40), sets([10, 40], [10, 40], [11, 40]))).toMatchObject({ outcome: "increase", changes: { reps: 8, weight: 42.5 } });
    expect(evaluate_progression(double, target(3, 10, 40), sets([10, 40], [9, 40], [10, 40]))).toMatchObject({ outcome: "hold" });

    const sum = normalize_progression({ type: "sum", reps_threshold: 30, increment: 2.5 });
    expect(evaluate_progression(sum, target(3, 10, 50), sets([12, 50], [10, 50], [7, 50]))).toMatchObject({ outcome: "hold", counter: "29/30 reps" });
    expect(evaluate_progression(sum, target(3, 10, 50), sets([15, 50], [15, 0]))).toMatchObject({ outcome: "increase", changes: { weight: 52.5 } });
    expect(step_weight(60, 2.5, true, 1)).toBe(61.5);
  });

  it("reports weeks from the chosen first day, leaders without zeroes, and per exercise records and trend", () => {
    const { store } = open_methods();
    const { session, bench, plank } = plan(store);
    store.start_workout("2026-11-09", session, started);
    store.start_workout("2026-11-09", session, started);
    store.start_workout("2026-11-03", session, started);
    expect(week_start_day("2026-11-10", 1)).toBe("2026-11-09");
    expect(week_start_day("2026-11-10", 0)).toBe("2026-11-08");

    const report = store.get_workout_report({ weeks: 2, today: "2026-11-10", week_start: 1 });
    expect(report.weeks.map((week) => [week.week_start, week.workouts, week.sets, week.volume, week.duration])).toEqual([
      ["2026-11-02", 1, 5, 900, 120],
      ["2026-11-09", 2, 10, 1800, 240],
    ]);
    const volume = report.leaders.find((board) => board.key === "total_volume")!;
    expect(volume.rows).toEqual([{ exercise_id: bench, name: "Bench Press", value: 2700 }]);
    expect(report.leaders.find((board) => board.key === "sets")!.rows.map((row) => row.exercise_id)).toEqual([bench, plank]);
    expect(report.bests.map((best) => best.stats.last_done)).toEqual(["2026-11-09", "2026-11-09"]);

    const bench_report = store.get_exercise_report(bench)!;
    expect(bench_report.stats).toMatchObject({ workouts: 3, sets: 9, best_weight: 60, best_reps: 5, best_one_rep_max: 70, best_set_volume: 300, total_volume: 2700, last_done: "2026-11-09" });
    expect(bench_report.trend.map((point) => [point.date, point.sets, point.volume])).toEqual([
      ["2026-11-03", 3, 900],
      ["2026-11-09", 6, 1800],
    ]);
    expect(bench_report.history.map((record) => record.date)).toEqual(["2026-11-09", "2026-11-09", "2026-11-03"]);
    expect(store.get_exercise_report("missing")).toBeNull();
  });
});

describe("importing the Trilium add-on's database", () => {
  const file = JSON.stringify({
    categories: ["Push"],
    exercises: {
      ex1: { id: "ex1", name: "Bench Press", measurement: "weight", equipment: "Barbell", muscles: ["Chest"], comment: "", tags: ["Push/Chest"] },
      ex2: { id: "ex2", name: "Run", measurement: "cardio", equipment: "", muscles: [], comment: "", tags: [] },
    },
    programs: {
      p1: {
        id: "p1",
        name: "Strength",
        comment: "",
        sessions: [{ id: "s1", name: "A", comment: "", tags: [], entries: [{ id: "e1", exerciseId: "ex1", sets: 3, reps: 5, weight: 135, rest: 120, progression: { type: "linear", increment: 5, successes: 1 } }] }],
      },
    },
    routines: { r1: { name: "Old Day", entries: [{ id: "e2", exerciseId: "ex2", sets: 1, duration: 30, distance: 5 }] } },
    log: {
      "2026-08-20": [
        { id: "w1", name: "Strength - A", sessionId: "s1", startedAt: "2026-08-20T08:00:00.000Z", finishedAt: "", comment: "", entries: [{ id: "we1", exerciseId: "ex1", sessionEntryId: "e1", target: { sets: 3, reps: 5, weight: 135, rest: 120 }, comment: "", sets: [{ id: "x", reps: 5, weight: 135, rpe: 8 }] }] },
        { id: "w2", name: "Old Day", routineId: "r1", startedAt: "2026-08-20T18:00:00.000Z", entries: [{ id: "we2", exerciseId: "ex2", sets: [{ id: "y", duration: 30, distance: 5 }] }] },
      ],
    },
  });

  it("brings in exercises, programs, legacy routines and the log, reading numbers in the file's units", () => {
    const { store } = open_methods();
    const summary = store.import_trilium_workouts(file, { mass_unit: "lb", distance_unit: "mi" });
    expect(summary).toEqual({ exercises: 2, programs: 2, sessions: 2, workouts: 2, skipped_workouts: 0 });
    const library = store.get_workout_library();
    expect(library.categories).toEqual(["Push", "Push/Chest"]);
    expect(library.programs.map((program) => [program.name, program.sessions.map((session) => session.name)])).toEqual([
      ["Imported", ["Old Day"]],
      ["Strength", ["A"]],
    ]);
    const entry = library.programs[1]!.sessions[0]!.entries[0]!;
    expect(entry.weight).toBeCloseTo(61.235, 3);
    expect(entry.progression.increment).toBeCloseTo(2.268, 3);
    expect(library.programs[0]!.sessions[0]!.entries[0]).toMatchObject({ duration: 1800 });
    expect(library.programs[0]!.sessions[0]!.entries[0]!.distance).toBeCloseTo(8.047, 3);

    const [strength, old_day] = store.list_workouts("2026-08-20");
    expect(strength).toMatchObject({ id: "w1", has_session: true });
    expect(strength!.entries[0]!.sets[0]!.weight).toBeCloseTo(61.235, 3);
    expect(strength!.entries[0]!.sets[0]!.rpe).toBe(8);
    expect(old_day).toMatchObject({ session_id: "r1", has_session: true });
    expect(old_day!.entries[0]!.sets[0]!.duration).toBe(1800);
  });

  it("changes nothing when the same file comes in twice, and a program present gains only new sessions", () => {
    const { store } = open_methods();
    store.import_trilium_workouts(file);
    expect(store.import_trilium_workouts(file)).toMatchObject({ programs: 0, sessions: 0, workouts: 0, skipped_workouts: 2 });
    const grown = JSON.parse(file) as { programs: { p1: { sessions: unknown[] } } };
    grown.programs.p1.sessions.push({ id: "s2", name: "B", entries: [] });
    expect(store.import_trilium_workouts(JSON.stringify(grown))).toMatchObject({ sessions: 1 });
    expect(store.get_workout_library().programs.find((program) => program.id === "p1")!.sessions.map((session) => session.name)).toEqual(["A", "B"]);
    expect(store.list_workouts("2026-08-20")).toHaveLength(2);
  });

  it("refuses what is not a database, and reads back its own export without converting again", () => {
    const { store } = open_methods();
    expect(() => store.import_trilium_workouts("nope")).toThrow("Not valid JSON.");
    expect(() => store.import_trilium_workouts("[1]")).toThrow("Expected a JSON object");
    store.import_trilium_workouts(file, { mass_unit: "lb", distance_unit: "km" });
    const exported = store.export_workouts();
    expect(JSON.parse(exported)).toMatchObject({ units: { weight: "kg", distance: "km" }, exercises: { ex1: { name: "Bench Press" } } });

    const copy = open_methods().store;
    copy.import_trilium_workouts(exported, { mass_unit: "lb", distance_unit: "mi" });
    expect(copy.list_workouts("2026-08-20")[0]!.entries[0]!.sets[0]!.weight).toBeCloseTo(61.235, 3);
    expect(copy.get_workout_library().programs.find((program) => program.id === "p1")!.sessions[0]!.entries[0]!.progression).toMatchObject({ type: "linear" });
  });
});

describe("importing from Liftosaur", () => {
  const backup = JSON.stringify({
    settings: { units: "lb", exercises: { custom1: { name: "Zercher Squat", meta: { targetMuscles: ["Quads"], synergistMuscles: ["Core"] } } } },
    history: [
      {
        id: 7,
        date: "2026-08-01T10:00:00.000Z",
        startTime: Date.parse("2026-08-01T10:00:00.000Z"),
        dayName: "Day 1",
        entries: [
          {
            exercise: { id: "benchPress", equipment: "barbell" },
            warmupSets: [{}, {}],
            sets: [
              { reps: 5, completedReps: 5, weight: { value: 135, unit: "lb" }, completedRpe: 8 },
              { reps: 5, completedReps: 4, completedWeight: { value: 60, unit: "kg" } },
              { reps: 5, weight: { value: 135, unit: "lb" } },
            ],
          },
          { exercise: { id: "pullUp", equipment: "bodyweight" }, sets: [{ reps: 8, completedReps: 8, weight: { value: 0, unit: "lb" } }] },
          { exercise: { id: "custom1" }, notes: "deep", sets: [{ completedReps: 3, weight: { value: 100, unit: "kg" } }] },
        ],
      },
    ],
  });

  const csv = [
    "Workout DateTime,Program,Day Name,Exercise,Is Warmup Set?,Required Reps,Completed Reps,Completed RPE,Required Weight Value,Required Weight Unit,Completed Weight Value,Completed Weight Unit,Target Muscles,Synergist Muscles,Notes",
    '2026-08-02T09:00:00.000Z,5/3/1,Squat Day,"Squat, Barbell",1,5,5,,45,lb,45,lb,Quads,"Glutes, Hamstrings",',
    '2026-08-02T09:00:00.000Z,5/3/1,Squat Day,"Squat, Barbell",0,5,5,9,225,lb,225,lb,Quads,"Glutes, Hamstrings","felt ""heavy"""',
    '2026-08-02T09:00:00.000Z,5/3/1,Squat Day,"Squat, Barbell",0,5,,,225,lb,,,Quads,,',
    "2026-08-02T09:00:00.000Z,5/3/1,Squat Day,Push Up,0,10,12,,,,,,Chest,,",
  ].join("\n");

  it("reads the JSON backup's performed sets in kg, titling built-in exercises from their ids", () => {
    const { store } = open_methods();
    expect(store.import_liftosaur_workouts(backup)).toEqual({ exercises: 3, workouts: 1, sets: 4, warmup_sets: 2, incomplete_sets: 1 });
    const library = store.get_workout_library();
    expect(library.exercises.map((exercise) => [exercise.name, exercise.measurement, exercise.equipment])).toEqual([
      ["Bench Press, Barbell", "weight", "Barbell"],
      ["Pull Up", "bodyweight", ""],
      ["Zercher Squat", "weight", ""],
    ]);
    expect(library.exercises[2]!.muscles).toEqual(["Core", "Quads"]);
    const [workout] = store.list_workouts("2026-08-01");
    expect(workout).toMatchObject({ id: "lft-7", name: "Day 1" });
    const bench = workout!.entries[0]!.sets;
    expect(bench[0]!.weight).toBeCloseTo(61.235, 3);
    expect(bench.map((set) => [set.reps, set.rpe])).toEqual([
      [5, 8],
      [4, 0],
    ]);
    expect(bench[1]!.weight).toBe(60);
    expect(workout!.entries[2]!.notes).toBe("deep");
    expect(store.import_liftosaur_workouts(backup).workouts).toBe(1);
    expect(store.list_workouts("2026-08-01")).toHaveLength(1);
  });

  it("reads the history CSV, quoted fields and all, leaving warmups and unperformed sets out", () => {
    const { store } = open_methods();
    expect(store.import_liftosaur_workouts(csv)).toEqual({ exercises: 2, workouts: 1, sets: 2, warmup_sets: 1, incomplete_sets: 1 });
    const library = store.get_workout_library();
    expect(library.exercises.map((exercise) => [exercise.name, exercise.measurement, exercise.equipment, exercise.muscles])).toEqual([
      ["Push Up", "bodyweight", "", ["Chest"]],
      ["Squat, Barbell", "weight", "Barbell", ["Glutes", "Hamstrings", "Quads"]],
    ]);
    const [workout] = store.list_workouts("2026-08-02");
    expect(workout!.name).toBe("Squat Day");
    expect(workout!.entries[0]!.notes).toBe('felt "heavy"');
    expect(workout!.entries[0]!.sets[0]!.weight).toBeCloseTo(102.058, 3);
    expect(workout!.entries[0]!.sets[0]!.rpe).toBe(9);
  });

  it("says what is wrong with a file that is neither export", () => {
    const { store } = open_methods();
    expect(() => store.import_liftosaur_workouts("  ")).toThrow("empty");
    expect(() => store.import_liftosaur_workouts("{ nope")).toThrow("isn't valid JSON");
    expect(() => store.import_liftosaur_workouts('{"a":1}')).toThrow("no history");
    expect(() => store.import_liftosaur_workouts("a,b\n1,2")).toThrow("Liftosaur history export");
  });
});

describe("wger lookup", () => {
  const languages = { results: [{ id: 2, short_name: "en" }, { id: 1, short_name: "de" }] };
  const exercises = {
    results: [
      { id: 1, category: { name: "Chest" }, equipment: [{ name: "Barbell" }], muscles: [{ name: "Pectoralis major", name_en: "Chest" }], muscles_secondary: [{ name: "Triceps brachii", name_en: "Triceps" }], translations: [{ language: 1, name: "Bankdrücken" }, { language: 2, name: "Bench Press" }] },
      { id: 2, category: { name: "Arms" }, equipment: [{ name: "none (bodyweight exercise)" }], muscles: [], translations: [{ language: 2, name: "Close-Grip Press Up" }] },
      { id: 3, category: { name: "Cardio" }, equipment: [], translations: [{ language: 2, name: "Rowing" }] },
      { id: 4, category: { name: "Legs" }, equipment: [], translations: [{ language: 1, name: "Nur Deutsch" }] },
    ],
  };

  function stub_fetch(fail_first = false) {
    let calls = 0;
    const fetch = vi.fn(async (url: string) => {
      calls += 1;
      if (fail_first && calls === 1) return new Response("", { status: 503, statusText: "Service Unavailable" });
      return Response.json(url.includes("/language/") ? languages : exercises);
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("searches names, earliest match first, guessing how each is measured", async () => {
    const fetch = stub_fetch();
    const { store } = open_methods();
    expect(await store.search_wger_exercises("press")).toEqual([
      { wger_id: 1, name: "Bench Press", measurement: "weight", equipment: "Barbell", muscles: ["Chest", "Triceps"], category: "Chest" },
      { wger_id: 2, name: "Close-Grip Press Up", measurement: "bodyweight", equipment: "", muscles: [], category: "Arms" },
    ]);
    expect(await store.search_wger_exercises("row")).toMatchObject([{ name: "Rowing", measurement: "cardio" }]);
    expect(await store.search_wger_exercises(" ")).toEqual([]);
    // The index is fetched once.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a failed fetch and tries again on the next search", async () => {
    stub_fetch(true);
    const { store } = open_methods();
    await expect(store.search_wger_exercises("bench")).rejects.toThrow("wger request failed: 503");
    expect(await store.search_wger_exercises("bench")).toHaveLength(1);
  });
});
