import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { prune_history } from "../src/shared/history/store.ts";
import { bind_methods, open_store, sync_engine } from "../src/shared/store.ts";

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, store: bind_methods(() => database, () => undefined) };
}

const started = "2026-11-10T09:00:00.000Z";

describe("history", () => {
  it("keeps a version of a workout for every change to it, its sets included, and brings a deleted one back whole", () => {
    const { store } = open_methods();
    const bench = store.save_exercise({ name: "Bench Press", measurement: "weight" });
    const workout = store.start_workout("2026-11-10", null, started);
    const entry = store.add_workout_exercise(workout, bench);
    const set = store.add_workout_set(entry);
    store.update_workout_set(set, { reps: 5, weight: 60 });

    const versions = store.list_item_history("workout", workout);
    expect(versions.at(-1)!.change).toBe("created");
    expect(versions.slice(0, -1).every((version) => version.change === "edited")).toBe(true);
    expect(versions[0]).toMatchObject({ kind: "workout", kind_label: "Workout", summary: "1 exercise, 2 sets", origin: "here" });

    store.delete_workout(workout);
    expect(store.list_workouts("2026-11-10")).toEqual([]);
    const deleted = store.list_recent_changes(10).find((change) => change.item_id === workout)!;
    expect(deleted.change).toBe("deleted");

    store.restore_item_version("workout", deleted.id);
    const back = store.list_workouts("2026-11-10")[0]!;
    expect(back.id).toBe(workout);
    expect(back.entries[0]!.sets.find((each) => each.id === set)).toMatchObject({ reps: 5, weight: 60 });
    expect(store.list_item_history("workout", workout)[0]!.change).toBe("restored");
  });

  it("puts an edited food back as an earlier version had it", () => {
    const { store } = open_methods();
    const oats = store.save_food({ name: "Oats", serving_size: 50, serving_unit: "g", nutrients: { calories: 190 } });
    store.save_food({ id: oats, name: "Rolled Oats", serving_size: 50, serving_unit: "g", nutrients: { calories: 190 } });

    const [renamed, created] = store.list_item_history("food", oats);
    expect(renamed!.item_name).toBe("Rolled Oats");
    store.restore_item_version("food", created!.id);
    expect(store.get_diet().foods.find((food) => food.id === oats)!.name).toBe("Oats");
  });

  it("keeps a body day's readings as one item under its date", () => {
    const { store } = open_methods();
    store.set_body_reading("weight", "2026-11-10", 80);
    store.set_body_reading("waist", "2026-11-10", 90);
    store.set_body_note("2026-11-10", "after a run");

    const versions = store.list_item_history("body_day", "2026-11-10");
    expect(versions[0]).toMatchObject({ item_name: "Body on 2026-11-10", summary: "2 readings" });
    store.restore_item_version("body_day", versions.at(-1)!.id);
    expect(store.get_body_day("2026-11-10").rows.filter((row) => row.value !== null)).toHaveLength(1);
  });

  it("syncs the versions, and records a change only on the device that made it", () => {
    const phone = open_methods();
    const desktop = open_methods();
    const squat = phone.store.save_exercise({ name: "Squat", measurement: "weight" });

    sync_engine.apply_changes(desktop.database, sync_engine.collect_unpushed_changes(phone.database).changes);
    expect(desktop.store.list_item_history("exercise", squat).map((version) => [version.change, version.origin])).toEqual([["created", "elsewhere"]]);

    desktop.store.save_body_metric({ name: "Neck", kind: "length" });
    expect(desktop.store.list_item_history("exercise", squat)).toHaveLength(1);
  });

  it("prunes versions older than the days kept, keeping each item's newest", () => {
    const { database, store } = open_methods();
    const squat = store.save_exercise({ name: "Squat", measurement: "weight" });
    store.save_exercise({ id: squat, name: "Back Squat", measurement: "weight" });
    store.set_setting("history.keep_days", 30);

    prune_history(database, Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(store.list_item_history("exercise", squat).map((version) => version.item_name)).toEqual(["Back Squat"]);
  });
});
