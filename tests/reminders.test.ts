import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { app_link, route_of_link } from "../src/shared/links.ts";
import { due_reminders, reminder_moment, reminder_settings } from "../src/shared/schedule/reminders.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";

// A store on a throwaway database, with the methods the page calls.
function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, store: bind_methods(() => database, () => undefined) };
}

// Tuesday 10 November 2026 at the local time given.
function tuesday(time: string): Date {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  return new Date(2026, 10, 10, hours, minutes, seconds);
}

// ============================================================================
// Links
// ============================================================================

describe("links", () => {
  it("name a page of the app and are read back as its route", () => {
    expect(app_link("#/workouts/log")).toBe("x-fitness://workouts/log");
    expect(route_of_link("x-fitness://workouts/log")).toBe("#/workouts/log");
    expect(route_of_link("x-fitness://overview/")).toBe("#/overview");
  });

  it("leave anything else alone", () => {
    expect(route_of_link("--daemon")).toBeNull();
    expect(route_of_link("/usr/lib/x-fitness")).toBeNull();
    expect(route_of_link("x-fitness://workouts?evil=1")).toBeNull();
  });
});

// ============================================================================
// Settings
// ============================================================================

describe("reminder settings", () => {
  it("remind of training but not meals unless set, and fall back on a damaged time", () => {
    expect(reminder_settings({})).toEqual({ remind_meals: false, remind_training: true, training_day_time: "08:00" });
    expect(reminder_settings({ "schedule.remind_meals": true, "schedule.training_day_time": "late" })).toMatchObject({ remind_meals: true, training_day_time: "08:00" });
  });

  it("put a training day without a time at the reminder time", () => {
    const settings = reminder_settings({ "schedule.training_day_time": "06:30" });

    expect(reminder_moment({ kind: "workout", id: "push", title: "Do Push", due: "2026-11-10", overdue: false }, settings)).toEqual(tuesday("06:30"));
    expect(reminder_moment({ kind: "meal", id: "lunch", title: "Eat Lunch", due: "2026-11-10T11:00", overdue: false }, settings)).toEqual(tuesday("11:00"));
  });
});

// ============================================================================
// Reminders
// ============================================================================

describe("due reminders", () => {
  it("remind of a meal as it starts once turned on, linking to the diary", () => {
    const { database, store } = open_methods();

    expect(due_reminders(database, tuesday("10:59:30"), tuesday("11:00:30"))).toEqual([]);
    store.set_setting("schedule.remind_meals", true);

    expect(due_reminders(database, tuesday("10:59:30"), tuesday("11:00:30"))).toEqual([
      { key: "meal-lunch-2026-11-10T11:00", title: "Eat Lunch", body: "Starts at 11:00. Log what you eat in the diary.", url: "x-fitness://diet/diary" },
    ]);
    expect(due_reminders(database, tuesday("11:00:30"), tuesday("11:01:00"))).toEqual([]);
  });

  it("leave out a meal already logged", () => {
    const { database, store } = open_methods();
    store.set_setting("schedule.remind_meals", true);
    const oats = store.save_food({ name: "Oats", serving_size: 100, serving_unit: "g", nutrients: { calories: 380 } } as never);

    store.add_diary_entry({ date: "2026-11-10", kind: "food", ref_id: oats, amount: 50, unit: "g", meal: "lunch" } as never);

    expect(due_reminders(database, tuesday("10:59:30"), tuesday("11:00:30"))).toEqual([]);
  });

  it("remind of the training day's session at its time, or at the reminder time on a whole day", () => {
    const { database, store } = open_methods();
    const program = store.save_program({ name: "PPL" });
    store.save_program_session(program, { name: "Push", entries: [] });
    store.set_setting("workouts.schedule", { program, rule: "FREQ=WEEKLY;BYDAY=TU;BYHOUR=18;BYMINUTE=0", start: "2026-11-02" });

    expect(due_reminders(database, tuesday("17:59:40"), tuesday("18:00:10"))).toEqual([
      { key: "workout-" + store.get_workout_library().programs[0]!.sessions[0]!.id + "-2026-11-10T18:00", title: "Do Push", body: "Today's session, at 18:00.", url: "x-fitness://workouts/log" },
    ]);

    store.set_setting("workouts.schedule", { program, rule: "FREQ=WEEKLY;BYDAY=TU", start: "2026-11-02" });
    expect(due_reminders(database, tuesday("07:59:40"), tuesday("08:00:10")).map((reminder) => reminder.body)).toEqual(["Today's session."]);

    store.set_setting("schedule.remind_training", false);
    expect(due_reminders(database, tuesday("07:59:40"), tuesday("08:00:10"))).toEqual([]);
  });
});
