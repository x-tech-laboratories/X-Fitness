import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { migrations } from "../src/shared/body/migrations/index.ts";
import { bind_methods, open_store, sync_engine } from "../src/shared/store.ts";

function open_device() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, store: bind_methods(() => database, () => undefined) };
}

const goals_of = (store: ReturnType<typeof open_device>["store"]) => Object.fromEntries(store.list_body_goals().map((goal) => [goal.key, goal.value]));

// ── Store ────────────────────────────────────────────────────────────────────

describe("body goals", () => {
  it("sets, lists in their order and removes goals, each needing no metric", () => {
    const { store } = open_device();
    expect(store.list_body_goals()).toEqual([]);
    store.set_body_goal("hips", 96);
    store.set_body_goal("weight", 75);
    store.set_body_goal("waist", 84);
    store.set_body_goal("body_fat", 15);
    expect(store.list_body_goals()).toEqual([
      { key: "weight", value: 75 },
      { key: "body_fat", value: 15 },
      { key: "waist", value: 84 },
      { key: "hips", value: 96 },
    ]);

    store.set_body_goal("weight", 77.5);
    store.set_body_goal("waist", null);
    store.set_body_goal("hips", 0);
    store.set_body_goal("body_fat", -2);
    expect(store.list_body_goals()).toEqual([{ key: "weight", value: 77.5 }]);

    store.delete_body_metric("weight");
    expect(store.list_body_goals()).toEqual([{ key: "weight", value: 77.5 }]);
    expect(store.get_calculations("2026-11-14").body_goals).toEqual({ weight: 77.5 });
  });

  it("takes only weight, body fat and the girths", () => {
    const { store } = open_device();
    for (const key of ["height", "skinfold_thigh", "resting_heart_rate", "restinghr", ""]) expect(() => store.set_body_goal(key as never, 10)).toThrow();
    expect(store.list_body_goals()).toEqual([]);
  });

  it("shows on a metric's report and the 3D body by key: the weight goal on the first weight metric, a role's goal on its metric", () => {
    const { store } = open_device();
    store.set_body_goal("weight", 75);
    store.set_body_goal("waist", 84);
    store.set_body_goal("upper_arm", 38);
    store.set_body_reading("weight", "2026-11-01", 80);
    store.set_body_reading("waist", "2026-11-01", 90);
    store.set_body_reading("arm", "2026-11-01", 35);
    const second_weight = store.save_body_metric({ name: "Morning weight", kind: "weight" });
    store.set_body_reading(second_weight, "2026-11-01", 81);

    expect(store.get_body_report("weight", 0, "2026-11-10")).toMatchObject({ goal: 75, to_go: -5 });
    expect(store.get_body_report("waist", 0, "2026-11-10")).toMatchObject({ goal: 84, to_go: -6 });
    expect(store.get_body_report("arm", 0, "2026-11-10")).toMatchObject({ goal: 38, to_go: 3 });
    expect(store.get_body_report(second_weight, 0, "2026-11-10")).toMatchObject({ goal: null, to_go: null });
    expect(store.get_body_report("chest", 0, "2026-11-10").goal).toBeNull();

    const shape = store.get_body_shape("2026-11-10");
    expect(shape.measures).toMatchObject({ mass: 80, girths: { waist: 90, upper_arm: 35 } });
    expect(shape.goal).toMatchObject({ mass: 75, girths: { waist: 84, upper_arm: 38, chest: 0 } });
  });

  it("puts a goal with no metric for it into the 3D goal body", () => {
    const { store } = open_device();
    store.set_body_goal("calf", 38);
    expect(store.get_body_shape("2026-11-10").goal.girths.calf).toBe(38);
    expect(store.get_body_shape("2026-11-10").measures.girths.calf).toBeUndefined();
  });

  it("keeps each goal's versions in History and brings a removed one back", () => {
    const { store } = open_device();
    store.set_body_goal("waist", 84);
    store.set_body_goal("waist", 82);
    store.set_body_goal("waist", null);
    const versions = store.list_item_history("body_goal", "waist");
    expect(versions.map((version) => version.change)).toEqual(["deleted", "edited", "created"]);
    expect(versions[1]).toMatchObject({ kind_label: "Body goal", item_name: "Waist goal", summary: "82 cm" });
    store.restore_item_version("body_goal", versions[1]!.id);
    expect(goals_of(store)).toEqual({ waist: 82 });
  });

  it("syncs between devices", () => {
    const phone = open_device();
    const desktop = open_device();
    phone.store.set_body_goal("weight", 75);
    phone.store.set_body_goal("neck", 38);
    const outgoing = sync_engine.collect_unpushed_changes(phone.database);
    sync_engine.apply_changes(desktop.database, outgoing.changes);
    expect(goals_of(desktop.store)).toEqual({ weight: 75, neck: 38 });
  });
});

// ── Upgrading ────────────────────────────────────────────────────────────────

describe("carrying the metrics' goals over", () => {
  const table_step = migrations.find((migration) => migration.name.endsWith("_body_goals"))!;
  const carry_step = migrations.find((migration) => migration.name.endsWith("_carry_metric_goals"))!;

  // A database as it was before body goals, with the metrics given, then brought up to the carry-over.
  function upgrade(setup: (database: DatabaseSync) => void) {
    const database = new DatabaseSync(":memory:");
    database.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    for (const step of migrations.slice(0, migrations.indexOf(table_step) + 1)) for (const statement of step.statements) database.exec(statement);
    setup(database);
    for (const statement of carry_step.statements) database.exec(statement);
    return database;
  }

  const goals = (database: DatabaseSync) => Object.fromEntries((database.prepare("SELECT key, value FROM body_goals").all() as { key: string; value: number }[]).map((row) => [row.key, row.value]));

  it("takes the first weight metric's goal as the weight goal and each body fat or girth metric's under its role", () => {
    const database = upgrade((old) => {
      old.exec("UPDATE body_metrics SET goal = 75 WHERE id = 'weight'");
      old.exec("UPDATE body_metrics SET goal = 15 WHERE id = 'bodyfat'");
      old.exec("UPDATE body_metrics SET goal = 84 WHERE id = 'waist'");
      old.exec("UPDATE body_metrics SET goal = 38 WHERE id = 'arm'");
      old.exec("INSERT INTO body_metrics (id, name, kind, unit, goal, position) VALUES ('evening', 'Evening weight', 'weight', '', 79, 30)");
    });
    expect(goals(database)).toEqual({ weight: 75, body_fat: 15, waist: 84, upper_arm: 38 });
  });

  it("finds the weight metric by kind and place, whatever its id", () => {
    const database = upgrade((old) => {
      old.exec("INSERT INTO body_metrics (id, name, kind, unit, goal, position) VALUES ('mine', 'Body weight', 'weight', '', 70, -1)");
      old.exec("UPDATE body_metrics SET goal = 75 WHERE id = 'weight'");
    });
    expect(goals(database)).toEqual({ weight: 70 });
  });

  it("lets the first metric by position win when two stand for the same girth", () => {
    const database = upgrade((old) => {
      old.exec("UPDATE body_metrics SET goal = 84, position = 20 WHERE id = 'waist'");
      old.exec("INSERT INTO body_metrics (id, name, kind, unit, goal, position, role) VALUES ('belly', 'Belly', 'length', '', 88, 19, 'waist')");
    });
    expect(goals(database)).toEqual({ waist: 88 });
  });

  it("drops the goals of custom metrics, the height, skinfolds and the resting pulse", () => {
    const database = upgrade((old) => {
      old.exec("UPDATE body_metrics SET goal = 55 WHERE id = 'restinghr'");
      old.exec("UPDATE body_metrics SET goal = 181 WHERE id = 'height'");
      old.exec("UPDATE body_metrics SET goal = 1.2 WHERE id = 'skinfold_thigh'");
      old.exec("INSERT INTO body_metrics (id, name, kind, unit, goal, position) VALUES ('bp', 'Blood Pressure', 'custom', 'mmHg', 120, 30)");
    });
    expect(goals(database)).toEqual({});
  });

  it("keeps the goals already there when run again, as when a synced device upgrades too", () => {
    const database = upgrade((old) => old.exec("UPDATE body_metrics SET goal = 75 WHERE id = 'weight'"));
    database.exec("UPDATE body_goals SET value = 74");
    database.exec("UPDATE body_metrics SET goal = 70 WHERE id = 'weight'");
    for (const statement of carry_step.statements) database.exec(statement);
    expect(goals(database)).toEqual({ weight: 74 });
  });

  it("upgrades an opened, synced database: the goals carried over, the column gone, an old metric version still restorable", () => {
    const { database, store } = open_device();
    // The database is turned back to just before the carry-over, its sync triggers naming the goal column again.
    database.exec("ALTER TABLE body_metrics ADD goal real DEFAULT 0 NOT NULL");
    database.prepare("UPDATE schema_versions SET version = ? WHERE owner = 'body'").run(migrations.indexOf(carry_step));
    sync_engine.install(database);
    database.exec("UPDATE body_metrics SET goal = 82 WHERE id = 'waist'");
    store.save_body_metric({ id: "waist", name: "Belly", kind: "length", role: "waist" });

    open_store(database);

    expect(goals_of(store)).toEqual({ waist: 82 });
    expect((database.prepare("SELECT name FROM pragma_table_info('body_metrics')").all() as { name: string }[]).map((column) => column.name)).not.toContain("goal");
    store.save_body_metric({ id: "waist", name: "Waist", kind: "length", role: "waist" });
    const old_version = store.list_item_history("metric", "waist").find((version) => version.item_name === "Belly")!;
    store.restore_item_version("metric", old_version.id);
    expect(store.list_body_metrics().find((metric) => metric.id === "waist")?.name).toBe("Belly");
    expect(sync_engine.collect_unpushed_changes(database).changes.length).toBeGreaterThan(0);
  });
});
