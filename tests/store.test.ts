import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { migrate } from "@x-tech-laboratories/x-libs/sql";

import { bind_methods, features, is_read_only, needs_upgrade, open_store, setting_defaults } from "../src/shared/store.ts";

function open_database(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return database;
}

describe("store", () => {
  it("records each feature's schema version and opens again without redoing a step", () => {
    const database = open_database();
    open_store(database);
    const versions = database.prepare("SELECT owner, version FROM schema_versions WHERE owner = 'settings'").all().map((row) => ({ ...row }));
    expect(versions).toEqual([{ owner: "settings", version: 1 }]);
  });

  it("takes a database from before X-Libs owners, its body step counted as the two it became, and keeps its data", () => {
    const database = new DatabaseSync(":memory:");
    const old_steps: Record<string, number> = { settings: 1, workouts: 1, diet: 1, body: 2 };
    for (const feature of features) migrate(database, feature.migrations.slice(0, old_steps[feature.id]), { owner: feature.id });
    database.exec("DROP TABLE schema_versions");
    database.exec("CREATE TABLE schema_versions (feature TEXT PRIMARY KEY, version INTEGER NOT NULL)");
    database.exec("INSERT INTO schema_versions VALUES ('settings', 1), ('workouts', 1), ('diet', 1), ('body', 1)");
    database.exec("INSERT INTO body_readings (metric_id, date, value) VALUES ('waist', '2026-11-01', 90)");

    expect(needs_upgrade(database)).toBe(true);
    open_store(database);

    expect(database.prepare("SELECT owner, version FROM schema_versions WHERE owner NOT LIKE 'history:%' ORDER BY owner").all().map((row) => ({ ...row }))).toEqual(
      features.filter((feature) => feature.migrations.length > 0).map((feature) => ({ owner: feature.id, version: feature.migrations.length })).sort((first, second) => first.owner.localeCompare(second.owner)),
    );
    expect(database.prepare("SELECT role FROM body_metrics WHERE id = 'waist'").get()).toMatchObject({ role: "waist" });
    expect(database.prepare("SELECT value FROM body_readings WHERE metric_id = 'waist'").get()).toMatchObject({ value: 90 });
    expect(needs_upgrade(database)).toBe(false);
  });

  it("tells a database that is behind on a feature's schema, but not a new or current one, so it is backed up first", () => {
    expect(needs_upgrade(new DatabaseSync(":memory:"))).toBe(false);
    const database = open_database();
    expect(needs_upgrade(database)).toBe(false);
    database.prepare("UPDATE schema_versions SET version = version - 1 WHERE owner = 'body'").run();
    expect(needs_upgrade(database)).toBe(true);
  });

  it("opens a database whose versions table still names its key column feature, keeping its data", () => {
    const database = open_database();
    database.prepare("INSERT INTO settings (key, value) VALUES ('mass_unit', '\"lb\"')").run();
    database.exec("ALTER TABLE schema_versions RENAME COLUMN owner TO feature");

    expect(needs_upgrade(database)).toBe(true);
    open_store(database);

    expect(needs_upgrade(database)).toBe(false);
    expect(database.prepare("SELECT value FROM settings WHERE key = 'mass_unit'").get()).toEqual({ value: '"lb"' });
  });

  it("keeps settings as JSON and gives every one, the ones never set at their defaults", () => {
    const fresh = bind_methods(() => open_database(), () => undefined);
    expect(fresh.get_settings()).toEqual(setting_defaults);
    const database = open_database();
    const bound = bind_methods(() => database, () => undefined);
    bound.set_setting("mass_unit", "lb");
    bound.set_setting("week_start", 0);
    expect(bound.get_settings()).toEqual({ ...setting_defaults, mass_unit: "lb", week_start: 0 });
  });

  it("announces writes and not reads", () => {
    const database = open_database();
    const on_change = vi.fn();
    const bound = bind_methods(() => database, on_change);
    bound.get_settings();
    expect(on_change).not.toHaveBeenCalled();
    bound.set_setting("energy_unit", "kJ");
    expect(on_change).toHaveBeenCalledOnce();
    expect(is_read_only("list_sessions")).toBe(true);
    expect(is_read_only("add_session")).toBe(false);
  });
});
