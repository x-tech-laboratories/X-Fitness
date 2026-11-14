import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bmi_body_fat, change_per_day, daily_water, goal_progress, measured_energy } from "../src/shared/calculators/formulas.ts";
import {
  karvonen_zones,
  load_plates,
  max_heart_rate,
  one_rep_maxes,
  percent_table,
  riegel_time,
  running_met,
  strength_scores,
  vdot,
  vo2max_from_cooper,
  vo2max_from_heart,
  workout_calories,
} from "../src/shared/calculators/training.ts";
import { shift_day } from "../src/shared/body/readings.ts";
import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";

describe("the training formulas", () => {
  it("estimates a one-rep max by three formulas, counting the reps an RPE leaves in reserve", () => {
    expect(one_rep_maxes({ weight: 100, reps: 5, rpe: 0 })).toEqual({ epley: expect.closeTo(116.67, 2), brzycki: 112.5, lombardi: expect.closeTo(117.46, 2) });
    expect(one_rep_maxes({ weight: 100, reps: 5, rpe: 8 })?.epley).toBeCloseTo(123.33, 2);
    expect(one_rep_maxes({ weight: 100, reps: 1, rpe: 10 })).toEqual({ epley: 100, brzycki: 100, lombardi: 100 });
    expect(one_rep_maxes({ weight: 0, reps: 5, rpe: 0 })).toBeNull();
    expect(percent_table(100).slice(0, 5).map((row) => [row.percent, row.weight, row.reps])).toEqual([[100, 100, 1], [95, 95, 2], [90, 90, 3], [85, 85, 5], [80, 80, 8]]);
  });

  it("scores a powerlifting total against body weight, needing a sex", () => {
    expect(strength_scores(500, 80, "male")).toEqual({ wilks: expect.closeTo(341.3, 1), dots: expect.closeTo(344.8, 1), ipf_gl: expect.closeTo(70.5, 1) });
    expect(strength_scores(300, 60, "female")?.wilks).toBeCloseTo(334.5, 1);
    expect(strength_scores(500, 80, "")).toBeNull();
  });

  it("gives heart-rate zones between the resting and Tanaka's maximum pulse, and VO2max from it", () => {
    expect(max_heart_rate(30)).toBe(187);
    expect(karvonen_zones(60, 187)?.[1]).toEqual({ label: "Zone 2: endurance", low: expect.closeTo(136.2, 1), high: expect.closeTo(148.9, 1) });
    expect(karvonen_zones(190, 187)).toBeNull();
    expect(vo2max_from_heart(187, 60)).toBeCloseTo(47.7, 1);
  });

  it("reads VO2max from a run or a Cooper test and predicts race times", () => {
    expect(vdot(5, 1200)).toBeCloseTo(49.8, 1);
    expect(vdot(0.5, 120)).toBeNull();
    expect(vo2max_from_cooper(2.4)).toBeCloseTo(42.4, 1);
    expect(riegel_time(5, 1200, 10)).toBeCloseTo(2502, 0);
  });

  it("loads the fewest plates a side without going over", () => {
    const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
    expect(load_plates(100, 20, plates)).toEqual({ per_side: [{ plate: 25, count: 1 }, { plate: 15, count: 1 }], loaded: 100 });
    expect(load_plates(101, 20, plates)?.loaded).toBe(100);
    expect(load_plates(20, 20, plates)).toEqual({ per_side: [], loaded: 20 });
    expect(load_plates(15, 20, plates)).toBeNull();
  });

  it("works out a workout's energy from METs, with runs by their pace", () => {
    expect(workout_calories(5, 80, 3600)).toBe(400);
    expect(running_met(10, 3600)).toBeCloseTo(10.52, 2);
    expect(running_met(5, 3600)).toBeCloseTo(3.38, 2);
  });
});

describe("the energy and trend formulas", () => {
  const weights = (days: number, from: number, to: number) =>
    Array.from({ length: days }, (_, index) => ({ date: shift_day("2026-11-01", index), value: from + ((to - from) * index) / (days - 1) }));

  it("estimates body fat from BMI by Deurenberg, and water from weight", () => {
    expect(bmi_body_fat(24.69, 30, "male")).toBeCloseTo(20.3, 1);
    expect(bmi_body_fat(24.69, 30, "")).toBeNull();
    expect(daily_water(80)).toBeCloseTo(2.8);
  });

  it("finds the trend a day through readings at least a week apart", () => {
    expect(change_per_day(weights(15, 80, 79))).toBeCloseTo(-1 / 14);
    expect(change_per_day(weights(5, 80, 79))).toBeNull();
  });

  it("measures the energy burned from what was eaten and the weight lost", () => {
    const intake = Array.from({ length: 14 }, (_, index) => ({ date: shift_day("2026-11-01", index), calories: 2500, entries: 3 }));
    expect(measured_energy(intake, weights(15, 80, 79))).toEqual({ days_logged: 14, average_intake: 2500, weekly_change: expect.closeTo(-0.5), tdee: expect.closeTo(3050) });
    expect(measured_energy(intake.slice(0, 6), weights(15, 80, 79))).toBeNull();
  });

  it("gives the weeks to a weight goal at the trend's and the plan's pace", () => {
    expect(goal_progress(80, 75, -0.5, -0.25)).toEqual({ weight: 80, goal: 75, trend_weekly_change: -0.5, trend_weeks: 10, plan_weeks: 20 });
    expect(goal_progress(80, 75, 0.2, 0)).toMatchObject({ trend_weeks: null, plan_weeks: null });
    expect(goal_progress(80, 0, -0.5, 0)).toBeNull();
  });
});

describe("the training store", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 12, 0));
  });

  afterEach(() => vi.useRealTimers());

  function open(): FitnessMethods {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    store.set_setting("body.sex", "male");
    store.set_body_reading("height", "2026-01-01", 180);
    store.set_setting("body.birth_date", "1996-01-01");
    store.set_body_reading("weight", "2026-11-01", 80);
    store.set_body_reading("restinghr", "2026-11-01", 60);
    return store;
  }

  function log(store: FitnessMethods, date: string, exercise_id: string, sets: { reps?: number; weight?: number; rpe?: number; duration?: number; distance?: number }[], times?: [string, string]) {
    const workout = store.start_workout(date, null, times?.[0] ?? "");
    const entry = store.add_workout_exercise(workout, exercise_id);
    for (const values of sets) store.update_workout_set(store.add_workout_set(entry), values);
    if (times) store.finish_workout(workout, times[1]);
    return workout;
  }

  it("reads one-rep maxes, guesses the powerlifts from their names, and scores the total", () => {
    const store = open();
    const squat = store.save_exercise({ name: "Back Squat", measurement: "weight" });
    const front = store.save_exercise({ name: "Front Squat", measurement: "weight" });
    const bench = store.save_exercise({ name: "Bench Press", measurement: "weight" });
    const deadlift = store.save_exercise({ name: "Deadlift", measurement: "weight" });
    log(store, "2026-11-10", front, [{ reps: 3, weight: 120 }]);
    log(store, "2026-11-10", squat, [{ reps: 5, weight: 140 }, { reps: 3, weight: 150, rpe: 9 }]);
    log(store, "2026-11-11", bench, [{ reps: 5, weight: 100 }]);
    log(store, "2026-11-12", deadlift, [{ reps: 1, weight: 200 }]);
    log(store, "2026-07-01", deadlift, [{ reps: 1, weight: 260 }]);

    const report = store.get_training_calculations("2026-11-13");

    expect(report.lifts.find((lift) => lift.exercise_id === squat)).toMatchObject({ weight: 150, reps: 3, rpe: 9, one_rep_max: expect.closeTo(170, 1) });
    expect(report.big_three).toEqual({ squat, bench, deadlift });
    expect(report.total).toBeCloseTo(170 + 116.67 + 200, 1);
    expect(report.scores?.wilks).toBeGreaterThan(300);
    store.set_setting("calculators.squat_exercise", front);
    expect(store.get_training_calculations("2026-11-13").big_three.squat).toBe(front);
  });

  it("gives heart zones from the resting heart rate role, and race times from the best run", () => {
    const store = open();
    const run = store.save_exercise({ name: "Running", measurement: "cardio" });
    log(store, "2026-11-05", run, [{ duration: 1500, distance: 5 }]);
    log(store, "2026-11-09", run, [{ duration: 1200, distance: 5 }]);

    const report = store.get_training_calculations("2026-11-13");

    expect(report.heart).toMatchObject({ resting: 60, maximum: 187, vo2max: expect.closeTo(47.7, 1) });
    expect(report.running.exercise_id).toBe(run);
    expect(report.running.best).toMatchObject({ date: "2026-11-09", vdot: expect.closeTo(49.8, 1) });
    expect(report.running.predictions.find((race) => race.label === "10K")?.seconds).toBeCloseTo(2502, 0);
  });

  it("works out each workout's energy, taking its own length when timed", () => {
    const store = open();
    const press = store.save_exercise({ name: "Overhead Press", measurement: "weight" });
    const untimed = log(store, "2026-11-10", press, [{ reps: 5, weight: 50 }, { reps: 5, weight: 50 }, { reps: 5, weight: 50 }]);
    const timed = log(store, "2026-11-11", press, [{ reps: 5, weight: 50 }], ["2026-11-11T10:00:00.000Z", "2026-11-11T11:00:00.000Z"]);

    const energy = store.list_workout_energy("2026-11-01", "2026-11-13");

    expect(energy.find((workout) => workout.workout_id === untimed)).toMatchObject({ seconds: 360, calories: expect.closeTo(40) });
    expect(energy.find((workout) => workout.workout_id === timed)).toMatchObject({ seconds: 3600, calories: expect.closeTo(400) });
    store.set_setting("calculators.met_weight", 6);
    expect(store.list_workout_energy("2026-11-11", "2026-11-11")[0]?.calories).toBeCloseTo(480);
  });

  it("measures the daily energy from the diary and weights, and the plan can start from it", () => {
    const store = open();
    const food = store.save_food({ name: "Meal", serving_size: 1, serving_unit: "serving", nutrients: { calories: 2500 } });
    store.set_body_reading("weight", "2026-11-01", null);
    for (let index = 1; index <= 14; index += 1) store.add_diary_entry({ date: shift_day("2026-11-13", -index), kind: "food", ref_id: food, amount: 1, unit: "serving" });
    store.set_body_reading("weight", "2026-10-30", 80);
    store.set_body_reading("weight", "2026-11-13", 79);

    const formula = store.get_calculations("2026-11-13");
    store.set_setting("calculators.energy_source", "measured");
    const measured = store.get_calculations("2026-11-13");

    expect(formula.measured).toMatchObject({ days_logged: 14, average_intake: 2500, tdee: expect.closeTo(3050, -1) });
    expect(measured.goals.find((goal) => goal.key === "calories")?.value).toBe(3050);
    expect(formula.goals.find((goal) => goal.key === "calories")?.value).not.toBe(3050);
  });

  it("projects the weight goal at the trend's pace", () => {
    const store = open();
    store.set_body_reading("weight", "2026-11-01", null);
    store.set_body_reading("weight", "2026-10-30", 80);
    store.set_body_reading("weight", "2026-11-13", 79);
    store.save_body_metric({ id: "weight", name: "Weight", kind: "weight", goal: 75 });

    expect(store.get_calculations("2026-11-13").progress).toMatchObject({ weight: 79, goal: 75, trend_weekly_change: -0.5, trend_weeks: 8 });
  });
});
