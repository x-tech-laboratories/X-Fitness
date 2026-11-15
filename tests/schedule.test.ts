import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { default_meals } from "../src/shared/diet/model.ts";
import { meal_actions, next_session, workout_action, type TrainingSchedule } from "../src/shared/schedule/model.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";

const sessions = [
  { id: "push", name: "Push" },
  { id: "pull", name: "Pull" },
  { id: "legs", name: "Legs" },
];

// Mondays, Wednesdays and Fridays at 18:00, counted from Monday 2 November 2026.
const evenings: TrainingSchedule = { program: "ppl", rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=18;BYMINUTE=0", start: "2026-11-02" };
const none = { session_id: "", date: "" };

// Tuesday 10 November 2026 at the time given.
function tuesday(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2026, 10, 10, hours, minutes);
}

describe("meal actions", () => {
  it("gives a meal still to come today", () => {
    const lunch = meal_actions(default_meals, new Set(), tuesday("09:00")).find((action) => action.id === "lunch");
    expect(lunch).toEqual({ kind: "meal", id: "lunch", title: "Eat Lunch", due: "2026-11-10T11:00", overdue: false });
  });

  it("keeps an uneaten meal overdue until the next one starts, then moves it to tomorrow", () => {
    expect(meal_actions(default_meals, new Set(), tuesday("12:00")).find((action) => action.id === "lunch")).toMatchObject({ due: "2026-11-10T11:00", overdue: true });
    expect(meal_actions(default_meals, new Set(), tuesday("17:30")).find((action) => action.id === "lunch")).toMatchObject({ due: "2026-11-11T11:00", overdue: false });
  });

  it("moves an eaten meal to tomorrow and leaves meals without a start out", () => {
    const actions = meal_actions(default_meals, new Set(["lunch"]), tuesday("12:00"));
    expect(actions.find((action) => action.id === "lunch")).toMatchObject({ due: "2026-11-11T11:00", overdue: false });
    expect(actions.map((action) => action.id)).toEqual(["breakfast", "lunch", "dinner"]);
  });
});

describe("workout action", () => {
  it("takes the sessions in turn after the last one done", () => {
    expect(next_session(sessions, "")?.id).toBe("push");
    expect(next_session(sessions, "pull")?.id).toBe("legs");
    expect(next_session(sessions, "legs")?.id).toBe("push");
  });

  it("gives the next training day's session", () => {
    const action = workout_action(evenings, sessions, { session_id: "push", date: "2026-11-09" }, tuesday("12:00"));
    expect(action).toEqual({ kind: "workout", id: "pull", title: "Do Pull", due: "2026-11-11T18:00", overdue: false });
  });

  it("keeps a missed training day overdue until the next one comes due", () => {
    expect(workout_action(evenings, sessions, { session_id: "legs", date: "2026-11-06" }, tuesday("12:00"))).toMatchObject({ id: "push", due: "2026-11-09T18:00", overdue: true });
    const wednesday_evening = new Date(2026, 10, 11, 19, 0);
    expect(workout_action(evenings, sessions, { session_id: "legs", date: "2026-11-06" }, wednesday_evening)).toMatchObject({ id: "push", due: "2026-11-11T18:00", overdue: true });
  });

  it("skips today's training day once trained today", () => {
    const monday_noon = new Date(2026, 10, 9, 12, 0);
    expect(workout_action(evenings, sessions, { session_id: "push", date: "2026-11-09" }, monday_noon)).toMatchObject({ id: "pull", due: "2026-11-11T18:00" });
  });

  it("gives a rule without an hour as whole days, overdue only once the day is over", () => {
    const days: TrainingSchedule = { ...evenings, rule: "FREQ=WEEKLY;BYDAY=TU,TH" };
    expect(workout_action(days, sessions, none, tuesday("20:00"))).toMatchObject({ id: "push", due: "2026-11-10", overdue: false });
    expect(workout_action(days, sessions, none, new Date(2026, 10, 11, 8, 0))).toMatchObject({ due: "2026-11-10", overdue: true });
  });

  it("keeps an interval in step with the day it counts from", () => {
    const every_other_day: TrainingSchedule = { ...evenings, rule: "FREQ=DAILY;INTERVAL=2", start: "2026-11-01" };
    expect(workout_action(every_other_day, sessions, { session_id: "push", date: "2026-11-09" }, tuesday("12:00"))).toMatchObject({ due: "2026-11-11", overdue: false });
  });

  it("gives nothing without a rule or sessions", () => {
    expect(workout_action({ ...evenings, rule: "" }, sessions, none, tuesday("12:00"))).toBeNull();
    expect(workout_action(evenings, [], none, tuesday("12:00"))).toBeNull();
  });
});

describe("list_next_actions", () => {
  it("lists the meals and the followed program's next session, missed ones first", () => {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    const program = store.save_program({ name: "PPL" });
    const push = store.save_program_session(program, { name: "Push", entries: [] });
    store.save_program_session(program, { name: "Pull", entries: [] });
    store.start_workout("2026-11-09", push, "2026-11-09T18:00:00.000Z");
    store.set_setting("workouts.schedule", { ...evenings, program });

    const actions = store.list_next_actions("2026-11-10T12:00");
    expect(actions.map((action) => [action.title, action.due, action.overdue])).toEqual([
      ["Eat Lunch", "2026-11-10T11:00", true],
      ["Eat Dinner", "2026-11-10T17:00", false],
      ["Eat Breakfast", "2026-11-11T04:00", false],
      ["Do Pull", "2026-11-11T18:00", false],
    ]);
    expect(() => store.list_next_actions("today")).toThrow(/local time/);
  });
});
