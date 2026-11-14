import { DatabaseSync } from "node:sqlite";

import { migrate } from "@x-tech-laboratories/x-libs/sql";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bind_methods, features, open_store, setting_defaults, sync_engine } from "../src/shared/store.ts";
import { migrations as workout_migrations } from "../src/shared/workouts/migrations/index.ts";
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
    const quads = library.categories.find((category) => category.name === "Quads")!;
    expect(library.exercises).toEqual([{ id: squat, name: "Squat", measurement: "weight", equipment: "Barbell", muscles: ["Glutes", "Quads"], categories: [quads.id], notes: "Low bar", last_done: "2026-11-09", has_picture: false }]);
    expect(library.categories.map((category) => category.path)).toEqual([["Legs"], ["Legs", "Quads"], ["Cardio"]]);
    expect(library.equipment).toEqual(["Barbell"]);
    expect(() => store.save_exercise({ name: "  " })).toThrow("needs a name");
  });

  it("keeps an exercise's picture out of the library, through a save without one, and removes it with an empty one", () => {
    const { store } = open_methods();
    const picture = "data:image/webp;base64,UklGRg==";
    const squat = store.save_exercise({ name: "Squat", picture });
    const plank = store.save_exercise({ name: "Plank" });
    expect(store.get_workout_library().exercises.map((exercise) => [exercise.name, exercise.has_picture, "picture" in exercise])).toEqual([["Plank", false, false], ["Squat", true, false]]);
    expect(store.list_exercise_pictures()).toEqual({ [squat]: picture });

    store.save_exercise({ id: squat, name: "Back Squat" });
    expect(store.get_exercise_picture(squat)).toBe(picture);
    store.save_exercise({ id: squat, name: "Back Squat", picture: "" });
    expect(store.get_exercise_picture(squat)).toBe("");
    expect(store.get_exercise_picture(plank)).toBe("");
    expect(store.list_exercise_pictures()).toEqual({});

    expect(() => store.save_exercise({ name: "Row", picture: "https://example.com/row.png" })).toThrow("data URL of an image");
    expect(() => store.save_exercise({ name: "Row", picture: `data:image/png;base64,${"A".repeat(1_000_000)}` })).toThrow("too large");
  });

  it("renames a category keeping its subtree, merges onto a sibling of that name, moves one and deletes a subtree keeping the items", () => {
    const { store } = open_methods();
    const fly = store.save_exercise({ name: "Fly", categories: ["Push/Chest"] });
    const dip = store.save_exercise({ name: "Dip", categories: ["Upper/Chest"] });
    const id_of = (...path: string[]) => store.list_workout_categories().find((item) => item.path.join("/") === path.join("/"))!.id;
    store.add_workout_category("Inner", id_of("Push", "Chest"));
    store.rename_workout_category(id_of("Push"), "upper");
    let usage = store.list_workout_categories();
    expect(usage.map((item) => item.path.join("/"))).toEqual(["Upper", "Upper/Chest", "Upper/Chest/Inner"]);
    expect(usage[0]).toMatchObject({ name: "Upper", parent_id: null, exercises: 0, exercises_in_tree: 2 });
    expect(usage[1]).toMatchObject({ exercises: 2, exercises_in_tree: 2 });

    store.move_workout_category(id_of("Upper", "Chest", "Inner"), null);
    expect(store.list_workout_categories().map((item) => item.path.join("/"))).toEqual(["Upper", "Upper/Chest", "Inner"]);
    store.move_workout_category(id_of("Inner"), null, -1);
    expect(store.list_workout_categories().map((item) => item.path.join("/"))).toEqual(["Inner", "Upper", "Upper/Chest"]);

    store.delete_workout_category(id_of("Upper"));
    usage = store.list_workout_categories();
    expect(usage.map((item) => item.name)).toEqual(["Inner"]);
    expect(store.get_workout_library().exercises.map((exercise) => [exercise.id, exercise.categories])).toEqual([
      [dip, []],
      [fly, []],
    ]);
  });

  it("turns the category paths of an older database into a tree keyed by those paths", () => {
    const database = new DatabaseSync(":memory:");
    const tree_step = workout_migrations.findIndex((migration) => migration.name.endsWith("_category_tree"));
    for (const feature of features) migrate(database, feature.id === "workouts" ? feature.migrations.slice(0, tree_step) : feature.migrations, { owner: feature.id });
    database.prepare("INSERT INTO workout_categories (name) VALUES (?)").run("Cardio");
    database.prepare("INSERT INTO exercises (id, name, categories) VALUES (?, ?, ?)").run("fly", "Fly", JSON.stringify(["Push/Chest"]));
    database.prepare("INSERT INTO programs (id, name) VALUES (?, ?)").run("p", "Plan");
    database.prepare("INSERT INTO program_sessions (id, program_id, name, categories) VALUES (?, ?, ?, ?)").run("s", "p", "A", JSON.stringify(["Legs"]));
    open_store(database);
    const store = bind_methods(() => database, () => undefined);

    expect(store.list_workout_categories().map((item) => [item.id, item.parent_id, item.name, item.exercises_in_tree, item.sessions])).toEqual([
      ["Cardio", null, "Cardio", 0, 0],
      ["Legs", null, "Legs", 0, 1],
      ["Push", null, "Push", 1, 0],
      ["Push/Chest", "Push", "Chest", 1, 0],
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

  it("carries a logged workout with its plan to another device through sync", () => {
    const phone = open_methods();
    const desktop = open_methods();
    const { session, bench } = plan(phone.store);
    const workout = phone.store.start_workout("2026-11-10", session, started);
    const entry = phone.store.list_workouts("2026-11-10")[0]!.entries[0]!;
    phone.store.update_workout_set(entry.sets[0]!.id, { reps: 6, rpe: 9 });
    phone.store.finish_workout(workout, "2026-11-10T10:00:00.000Z");
    phone.store.save_exercise({ id: bench, name: "Bench Press", picture: "data:image/webp;base64,UklGRg==" });
    const outgoing = sync_engine.collect_unpushed_changes(phone.database);
    sync_engine.apply_changes(desktop.database, outgoing.changes);

    expect(desktop.store.list_workouts("2026-11-10")).toEqual(phone.store.list_workouts("2026-11-10"));
    expect(desktop.store.list_workouts("2026-11-10")[0]).toMatchObject({ id: workout, has_session: true, finished_at: "2026-11-10T10:00:00.000Z" });
    expect(desktop.store.get_workout_library()).toEqual(phone.store.get_workout_library());
    expect(desktop.store.get_exercise_report(bench)?.history).toHaveLength(1);
    expect(desktop.store.get_exercise_picture(bench)).toBe("data:image/webp;base64,UklGRg==");
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
    expect(report.bests.find((best) => best.exercise.id === bench)!.trend.map((point) => point.date)).toEqual(["2026-11-03", "2026-11-09"]);
    expect(report.days).toHaveLength(9);
    expect(report.days.filter((day) => day.workouts > 0).map((day) => [day.date, day.workouts, day.sets])).toEqual([
      ["2026-11-03", 1, 5],
      ["2026-11-09", 2, 10],
    ]);
    expect(report.categories).toEqual([{ category: "Push", sets: 9 }, { category: "", sets: 6 }]);

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
      { id: 1, category: { name: "Chest" }, equipment: [{ name: "Barbell" }], muscles: [{ name: "Pectoralis major", name_en: "Chest" }], muscles_secondary: [{ name: "Triceps brachii", name_en: "Triceps" }], translations: [{ language: 1, name: "Bankdrücken" }, { language: 2, name: "Bench Press" }], images: [{ image: "https://wger.de/media/exercise-images/1/bench-2.png", is_main: false }, { image: "https://wger.de/media/exercise-images/1/bench-1.png", is_main: true }] },
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
      if (url.includes("/media/")) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
      return Response.json(url.includes("/language/") ? languages : exercises);
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("searches names, earliest match first, guessing how each is measured", async () => {
    const fetch = stub_fetch();
    const { store } = open_methods();
    expect(await store.search_wger_exercises("press")).toEqual([
      { wger_id: 1, name: "Bench Press", measurement: "weight", equipment: "Barbell", muscles: ["Chest", "Triceps"], category: "Chest", has_picture: true },
      { wger_id: 2, name: "Close-Grip Press Up", measurement: "bodyweight", equipment: "", muscles: [], category: "Arms", has_picture: false },
    ]);
    expect(await store.search_wger_exercises("row")).toMatchObject([{ name: "Rowing", measurement: "cardio" }]);
    expect(await store.search_wger_exercises(" ")).toEqual([]);
    // The index is fetched once.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fetches an exercise's main picture as a data URL, and nothing for one without a picture", async () => {
    const fetch = stub_fetch();
    const { store } = open_methods();
    expect(await store.lookup_wger_picture(1)).toBe("data:image/png;base64,iVBORw==");
    expect(fetch).toHaveBeenLastCalledWith("https://wger.de/media/exercise-images/1/bench-1.png");
    expect(await store.lookup_wger_picture(2)).toBe("");
    expect(await store.lookup_wger_picture(99)).toBe("");
  });

  it("reports a failed fetch and tries again on the next search", async () => {
    stub_fetch(true);
    const { store } = open_methods();
    await expect(store.search_wger_exercises("bench")).rejects.toThrow("wger request failed: 503");
    expect(await store.search_wger_exercises("bench")).toHaveLength(1);
  });
});
