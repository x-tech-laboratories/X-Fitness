import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { bind_methods, is_read_only, open_store, setting_defaults } from "../src/shared/store.ts";

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
