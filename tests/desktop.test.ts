import { DatabaseSync } from "node:sqlite";

import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { EventStream } from "@x-tech-laboratories/x-libs/server/events";

import { register_fitness_calls, register_method_calls } from "../src/server/calls.ts";
import { open_store } from "../src/shared/store.ts";
import { desktop_setting_defaults, read_desktop_settings } from "../src/shared/desktop.ts";
import { due_label, running_workouts, tray_items, tray_tooltip, type TrayState } from "../src/main/tray_menu.ts";
import type { NextAction } from "../src/shared/schedule/model.ts";
import type { Workout } from "../src/shared/workouts/model.ts";

// ============================================================================
// Desktop settings
// ============================================================================

describe("the desktop settings", () => {
  it("are all on when none were saved", () => {
    expect(read_desktop_settings(null)).toEqual(desktop_setting_defaults);
    expect(desktop_setting_defaults).toEqual({ show_tray_icon: true, keep_running_in_background: true, start_at_login: true });
  });

  it("keep what was saved and default anything damaged", () => {
    expect(read_desktop_settings({ show_tray_icon: false, start_at_login: "yes" })).toEqual({ show_tray_icon: false, keep_running_in_background: true, start_at_login: true });
  });
});

// ============================================================================
// Tray menu
// ============================================================================

const workout = (changes: Partial<Workout>): Workout => ({ id: "w1", date: "2026-11-19", name: "Push", session_id: "", started_at: "", finished_at: "", notes: "", entries: [], ...changes });
const action = (changes: Partial<NextAction>): NextAction => ({ kind: "meal", id: "m1", title: "Eat Lunch", due: "2026-11-19T12:30", overdue: false, ...changes });

describe("the tray menu", () => {
  const now = new Date("2026-11-19T18:42:10Z");

  it("finds only workouts started and not finished, with how long they ran", () => {
    const workouts = [
      workout({ id: "running", started_at: "2026-11-19T18:00:00Z" }),
      workout({ id: "done", started_at: "2026-11-19T08:00:00Z", finished_at: "2026-11-19T09:00:00Z" }),
      workout({ id: "planned" }),
      workout({ id: "nameless", name: "", started_at: "2026-11-19T18:42:00Z" }),
    ];

    expect(running_workouts(workouts, now)).toEqual([
      { id: "running", name: "Push", seconds: 2530 },
      { id: "nameless", name: "Workout", seconds: 10 },
    ]);
  });

  it("says when an action is due as briefly as it can", () => {
    expect(due_label(action({}), "2026-11-19")).toBe("12:30");
    expect(due_label(action({ due: "2026-11-20T08:00" }), "2026-11-19")).toBe("tomorrow 08:00");
    expect(due_label(action({ due: "2026-11-23" }), "2026-11-19")).toBe("2026-11-23");
    expect(due_label(action({ due: "2026-11-19" }), "2026-11-19")).toBe("today");
    expect(due_label(action({ overdue: true }), "2026-11-19")).toBe("missed");
  });

  it("lists a running workout with Finish, the next three actions, then the commands", () => {
    const state: TrayState = {
      workouts: [{ id: "w1", name: "Push", seconds: 2530 }],
      next: [action({ id: "a" }), action({ id: "b", title: "Eat Dinner", due: "2026-11-19T19:00" }), action({ id: "c", title: "Do Pull", kind: "workout", due: "2026-11-20" }), action({ id: "d" })],
      today: "2026-11-19",
    };

    expect(tray_items(state)).toEqual([
      { kind: "open", label: "Push — 42:10", route: "#/workouts/log" },
      { kind: "finish", label: "Finish workout", workout_id: "w1" },
      { kind: "separator" },
      { kind: "open", label: "Eat Lunch — 12:30", route: "#/overview" },
      { kind: "open", label: "Eat Dinner — 19:00", route: "#/overview" },
      { kind: "open", label: "Do Pull — tomorrow", route: "#/overview" },
      { kind: "separator" },
      { kind: "command", label: "Show X-Fitness", command: "show" },
      { kind: "command", label: "Quit", command: "quit" },
      { kind: "command", label: "Quit completely", command: "quit_completely" },
    ]);
    expect(tray_tooltip(state)).toBe("X-Fitness\nPush — 42:10");
  });

  it("shows only the commands when nothing runs or comes next", () => {
    const state: TrayState = { workouts: [], next: [], today: "2026-11-19" };

    expect(tray_items(state).map((item) => item.kind)).toEqual(["command", "command", "command"]);
    expect(tray_tooltip(state)).toBe("X-Fitness");
  });
});

// ============================================================================
// Calls over HTTP
// ============================================================================

describe("a table of calls over HTTP", () => {
  it("answers each call as JSON, refuses one it lacks, and tells of changes but not reads", async () => {
    const app = fastify();
    const changed = vi.fn();
    const methods = { get_name: () => "plain text", set_name: (name: string) => void name };
    register_method_calls(app, "/daemon", methods, new EventStream(), { on_change: changed });

    const read = await app.inject({ method: "POST", url: "/daemon/get_name", payload: [] });
    const write = await app.inject({ method: "POST", url: "/daemon/set_name", payload: ["Ada"], headers: { "x-client-id": "window" } });
    const missing = await app.inject({ method: "POST", url: "/daemon/toString", payload: [] });

    expect(JSON.parse(read.body)).toBe("plain text");
    expect(write.statusCode).toBe(204);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith("window");
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

describe("the data calls over HTTP", () => {
  it("send a call's text answer as JSON, so the window can read it", async () => {
    const app = fastify();
    const database = new DatabaseSync(":memory:");
    open_store(database);
    register_fitness_calls(app, () => database, new EventStream());

    const started = await app.inject({ method: "POST", url: "/call/start_workout", payload: ["2026-11-19", null, "2026-11-19T18:00:00.000Z"] });

    expect(started.headers["content-type"]).toContain("application/json");
    expect(typeof JSON.parse(started.body)).toBe("string");
    await app.close();
  });
});
