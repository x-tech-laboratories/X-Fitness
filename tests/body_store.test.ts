import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { body_mass_index, moving_average, series_stats, shift_day } from "../src/shared/body/readings.ts";
import { bind_methods, open_store, setting_defaults } from "../src/shared/store.ts";

function open_body() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, body: bind_methods(() => database, () => undefined) };
}

describe("body metrics store", () => {
  it("starts with the add-on's metrics under ids every device shares, and a height setting", () => {
    const { body } = open_body();
    expect(body.list_body_metrics().map((metric) => metric.id)).toEqual(["weight", "bodyfat", "waist", "chest", "hips", "arm", "thigh", "neck", "restinghr"]);
    expect(body.list_body_metrics().at(-1)).toMatchObject({ name: "Resting Heart Rate", kind: "custom", unit: "bpm", goal: 0, readings: 0, last_date: "" });
    expect(setting_defaults["body.height"]).toBe(0);
  });

  it("keeps one reading per metric a day, and removes it when cleared", () => {
    const { database, body } = open_body();
    body.set_body_reading("weight", "2026-11-01", 82);
    body.set_body_reading("weight", "2026-11-01", 81.5);
    expect(database.prepare("SELECT value FROM body_readings WHERE metric_id = 'weight'").all().map((row) => ({ ...row }))).toEqual([{ value: 81.5 }]);
    body.set_body_reading("weight", "2026-11-01", null);
    body.set_body_reading("waist", "2026-11-01", 0);
    expect(database.prepare("SELECT COUNT(*) AS count FROM body_readings").get()).toMatchObject({ count: 0 });
    expect(() => body.set_body_reading("weight", "11/01/2026", 80)).toThrow("Not a day");
  });

  it("leaves nothing behind for a day without readings or a note", () => {
    const { database, body } = open_body();
    body.set_body_note("2026-11-01", "  after a long run ");
    expect(body.get_body_day("2026-11-01").comment).toBe("after a long run");
    body.set_body_note("2026-11-01", " ");
    expect(database.prepare("SELECT COUNT(*) AS count FROM body_days").get()).toMatchObject({ count: 0 });
  });

  it("shows the previous reading before the day and BMI from the latest weight on or before it", () => {
    const { body } = open_body();
    body.set_body_reading("weight", "2026-11-01", 80);
    body.set_body_reading("weight", "2026-11-03", 81);
    body.set_body_reading("waist", "2026-11-03", 90);
    expect(body.get_body_day("2026-11-02").bmi).toBeNull();

    body.set_setting("body.height", 180);
    const day = body.get_body_day("2026-11-03");
    const weight = day.rows.find((row) => row.metric.id === "weight")!;
    expect(weight).toMatchObject({ value: 81, previous: { date: "2026-11-01", value: 80 } });
    expect(day.rows.find((row) => row.metric.id === "waist")).toMatchObject({ value: 90, previous: null });
    expect(day.bmi?.weight).toEqual({ date: "2026-11-03", value: 81 });
    expect(day.bmi?.value).toBeCloseTo(81 / 1.8 ** 2);
    expect(body.get_body_day("2026-11-02").bmi?.weight).toEqual({ date: "2026-11-01", value: 80 });
  });

  it("adds, edits, reorders and deletes metrics, a metric's readings going with it", () => {
    const { body } = open_body();
    const id = body.save_body_metric({ name: " Blood Pressure ", kind: "custom", unit: "mmHg", goal: 120, comment: "" });
    expect(body.list_body_metrics().at(-1)).toMatchObject({ id, name: "Blood Pressure", unit: "mmHg", goal: 120, position: 9 });
    body.save_body_metric({ id, name: "Systolic", kind: "percent", unit: "mmHg", goal: -3 });
    expect(body.list_body_metrics().at(-1)).toMatchObject({ id, name: "Systolic", kind: "percent", unit: "", goal: 0 });

    body.move_body_metric("bodyfat", -1);
    body.move_body_metric("bodyfat", -1);
    expect(body.list_body_metrics().slice(0, 2).map((metric) => metric.id)).toEqual(["bodyfat", "weight"]);

    body.set_body_reading(id, "2026-11-01", 118);
    body.set_body_reading(id, "2026-11-02", 121);
    expect(body.list_body_metrics().find((metric) => metric.id === id)).toMatchObject({ readings: 2, last_date: "2026-11-02" });
    expect(body.delete_body_metric(id)).toBe(2);
    expect(body.list_body_metrics().some((metric) => metric.id === id)).toBe(false);
    expect(body.list_body_history(0, "2026-11-10")).toEqual([]);
  });

  it("reports a range with its change, extremes, 7-day average, distance to goal and BMI", () => {
    const { body } = open_body();
    body.set_setting("body.height", 200);
    body.save_body_metric({ id: "weight", name: "Weight", kind: "weight", goal: 75 });
    const readings: [string, number][] = [["2026-06-01", 90], ["2026-10-20", 84], ["2026-10-25", 82], ["2026-11-01", 80], ["2026-11-02", 81]];
    for (const [date, value] of readings) body.set_body_reading("weight", date, value);

    const report = body.get_body_report("weight", 30, "2026-11-10");
    expect(report.series.map((point) => point.date)).toEqual(["2026-10-20", "2026-10-25", "2026-11-01", "2026-11-02"]);
    expect(report.stats).toMatchObject({ first: { value: 84 }, latest: { date: "2026-11-02", value: 81 }, change: -3, lowest: 80, highest: 84, count: 4 });
    expect(report.average.map((point) => point.value)).toEqual([84, 83, 80, 80.5]);
    expect(report.to_go).toBe(-6);
    expect(report.bmi).toBeCloseTo(81 / 4);

    expect(body.get_body_report("weight", 0, "2026-11-10").stats?.count).toBe(5);
    const waist = body.get_body_report("waist", 90, "2026-11-10");
    expect(waist).toMatchObject({ stats: null, to_go: null, bmi: null });
  });

  it("lists history newest first with each day's readings and note", () => {
    const { body } = open_body();
    body.set_body_reading("weight", "2026-11-01", 80);
    body.set_body_reading("waist", "2026-11-01", 90);
    body.set_body_note("2026-11-05", "rest day");
    body.set_body_reading("weight", "2026-09-01", 85);
    expect(body.list_body_history(30, "2026-11-10")).toEqual([
      { date: "2026-11-05", values: {}, comment: "rest day" },
      { date: "2026-11-01", values: { weight: 80, waist: 90 }, comment: "" },
    ]);
  });

  it("announces its writes", () => {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const on_change = vi.fn();
    const body = bind_methods(() => database, on_change);
    body.get_body_day("2026-11-01");
    body.list_body_metrics();
    expect(on_change).not.toHaveBeenCalled();
    body.set_body_reading("weight", "2026-11-01", 80);
    expect(on_change).toHaveBeenCalledOnce();
  });
});

describe("body metrics rules", () => {
  it("averages each reading over the readings in the 7 days ending on it", () => {
    const series = [{ date: "2026-01-01", value: 10 }, { date: "2026-01-07", value: 20 }, { date: "2026-01-08", value: 30 }, { date: "2026-01-20", value: 40 }];
    expect(moving_average(series, 7).map((point) => point.value)).toEqual([10, 15, 25, 40]);
  });

  it("gives change as latest less first, and nothing for no readings", () => {
    expect(series_stats([])).toBeNull();
    expect(series_stats([{ date: "2026-01-01", value: 5 }, { date: "2026-01-02", value: 3 }])).toMatchObject({ change: -2, lowest: 3, highest: 5, count: 2 });
  });

  it("works BMI out from kg and cm, and none without both", () => {
    expect(body_mass_index(72, 180)).toBeCloseTo(22.22, 2);
    expect(body_mass_index(72, 0)).toBe(0);
    expect(body_mass_index(0, 180)).toBe(0);
  });

  it("steps days across months and years", () => {
    expect(shift_day("2026-12-31", 1)).toBe("2027-01-01");
    expect(shift_day("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("the 3D body's readings", () => {
  it("gives the starting metrics their roles and keeps a role saved on a metric", () => {
    const { body } = open_body();
    expect(Object.fromEntries(body.list_body_metrics().map((metric) => [metric.id, metric.role]))).toMatchObject({ weight: "", bodyfat: "body_fat", arm: "upper_arm", restinghr: "resting_heart_rate" });
    const id = body.save_body_metric({ name: "Calf", kind: "length", role: "calf" });
    body.save_body_metric({ id, name: "Calf", kind: "length", role: "elbow" as never });
    expect(body.list_body_metrics().at(-1)).toMatchObject({ id, role: "" });
  });

  it("takes the latest readings on or before the day, the goals, and the days that shape it", () => {
    const { body } = open_body();
    body.set_setting("body.height", 180);
    body.set_setting("body.sex", "male");
    body.save_body_metric({ id: "waist", name: "Waist", kind: "length", role: "waist", goal: 84 });
    body.set_body_reading("weight", "2026-11-01", 85);
    body.set_body_reading("waist", "2026-11-01", 92);
    body.set_body_reading("waist", "2026-11-05", 90);
    body.set_body_reading("restinghr", "2026-11-03", 60);

    const shape = body.get_body_shape("2026-11-04");
    expect(shape.measures).toEqual({ sex: "male", height: 180, mass: 85, body_fat: 0, girths: { neck: 0, chest: 0, waist: 92, hips: 0, upper_arm: 0, thigh: 0 } });
    expect(shape.goal).toMatchObject({ mass: 85, girths: { waist: 84 } });
    expect(shape.days).toEqual(["2026-11-01", "2026-11-05"]);
  });
});
