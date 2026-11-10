import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { bind_methods, open_store, sync_engine } from "../src/shared/store.ts";

function open_device(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return database;
}

// Sends one device's unpushed changes to another, as an exchange through the server does.
function push(from: DatabaseSync, to: DatabaseSync): void {
  const outgoing = sync_engine.collect_unpushed_changes(from);
  sync_engine.write_state(from, { pushed_seq: outgoing.up_to_seq });
  sync_engine.apply_changes(to, outgoing.changes);
}

describe("sync between devices", () => {
  it("carries body readings, notes and new metrics, and both devices keep one copy of the starting metrics", () => {
    const phone = open_device();
    const desktop = open_device();
    const on_phone = bind_methods(() => phone, () => undefined);
    const on_desktop = bind_methods(() => desktop, () => undefined);

    on_phone.set_body_reading("weight", "2026-11-10", 82.5);
    on_phone.set_body_note("2026-11-10", "After the long run");
    const calf = on_phone.save_body_metric({ name: "Calf", kind: "length", unit: "", goal: 0, comment: "" });
    push(phone, desktop);
    push(desktop, phone);

    const day = on_desktop.get_body_day("2026-11-10");
    expect(day.comment).toBe("After the long run");
    expect(day.rows.find((row) => row.metric.id === "weight")?.value).toBe(82.5);
    expect(on_desktop.list_body_metrics().map((metric) => metric.id)).toEqual(on_phone.list_body_metrics().map((metric) => metric.id));
    expect(on_desktop.list_body_metrics().filter((metric) => metric.id === "weight")).toHaveLength(1);
    expect(on_desktop.list_body_metrics().some((metric) => metric.id === calf)).toBe(true);
  });
});
