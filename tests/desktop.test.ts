import { DatabaseSync } from "node:sqlite";

import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { EventStream } from "@x-tech-laboratories/x-libs/server/events";

import { register_fitness_calls } from "../src/server/calls.ts";
import { open_store } from "../src/shared/store.ts";
import { desktop_setting_defaults, read_desktop_settings, starts_hidden } from "../src/shared/desktop.ts";
import { due_label, running_workouts, tray_view, type TrayActions, type TrayState } from "../src/main/tray_menu.ts";
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

  it("start hidden only when asked and there is a tray icon to open the window from", () => {
    expect(starts_hidden(["electron", "app", "--hidden"], true)).toBe(true);
    expect(starts_hidden(["electron", "app", "--hidden"], false)).toBe(false);
    expect(starts_hidden(["electron", "app"], true)).toBe(false);
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

  const actions = (): TrayActions => ({ open_route: vi.fn(), finish_workout: vi.fn(), show: vi.fn(), quit: vi.fn(), quit_completely: vi.fn() });
  const labels = (state: TrayState) => tray_view(state, actions()).rows.map((row) => (row.kind === "item" ? row.label : "—"));

  it("lists a running workout with Finish, the next three actions, then the commands", () => {
    const state: TrayState = {
      workouts: [{ id: "w1", name: "Push", seconds: 2530 }],
      next: [action({ id: "a" }), action({ id: "b", title: "Eat Dinner", due: "2026-11-19T19:00" }), action({ id: "c", title: "Do Pull", kind: "workout", due: "2026-11-20" }), action({ id: "d" })],
      today: "2026-11-19",
    };

    expect(labels(state)).toEqual(["Push — 42:10", "Finish workout", "—", "Eat Lunch — 12:30", "Eat Dinner — 19:00", "Do Pull — tomorrow", "—", "Show X-Fitness", "Quit", "Quit completely"]);
    expect(tray_view(state, actions()).tooltip).toBe("X-Fitness\nPush — 42:10");
  });

  it("finishes the workout and opens the page where each row points", () => {
    const state: TrayState = { workouts: [{ id: "w1", name: "Push", seconds: 60 }], next: [action({})], today: "2026-11-19" };
    const done = actions();
    const rows = tray_view(state, done).rows.filter((row) => row.kind === "item");

    for (const row of rows) row.run();

    expect(done.finish_workout).toHaveBeenCalledWith("w1");
    expect(done.open_route).toHaveBeenCalledWith("#/workouts/log");
    expect(done.open_route).toHaveBeenCalledWith("#/overview");
    expect(done.quit_completely).toHaveBeenCalled();
  });

  it("shows only the commands when nothing runs or comes next", () => {
    const state: TrayState = { workouts: [], next: [], today: "2026-11-19" };

    expect(labels(state)).toEqual(["Show X-Fitness", "Quit", "Quit completely"]);
    expect(tray_view(state, actions()).tooltip).toBe("X-Fitness");
  });
});

// ============================================================================
// Data calls over HTTP
// ============================================================================

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
