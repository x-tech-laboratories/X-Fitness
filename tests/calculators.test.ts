import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  age_on,
  basal_rates,
  body_mass_index,
  caliper_body_fat,
  calculate,
  composition,
  navy_body_fat,
  plan_goals,
  weight_at_body_fat,
  type GoalPlan,
  type Measures,
} from "../src/shared/calculators/formulas.ts";
import { bind_methods, open_store } from "../src/shared/store.ts";
import { format_change, to_stored_value, unit_of } from "../src/web/body/format.ts";

const someone: Measures = {
  sex: "male",
  age: 30,
  height: 180,
  weight: 80,
  body_fat: 0,
  neck: 40,
  waist: 90,
  hips: 0,
  skinfolds: {},
  activity: "light",
  bmr_formula: "mifflin_st_jeor",
};

const plan: GoalPlan = { body_fat: 0, bmi: 22, waist_to_height: 0.5, weekly_change: -0.5, protein_per_kg: 2, fat_percent: 25 };

describe("the fitness formulas", () => {
  it("takes whole years of age, counting the birthday itself", () => {
    expect(age_on("1990-11-13", "2026-11-12")).toBe(35);
    expect(age_on("1990-11-13", "2026-11-13")).toBe(36);
    expect(age_on("", "2026-11-13")).toBe(0);
    expect(age_on("2030-01-01", "2026-11-13")).toBe(0);
  });

  it("works out BMI and leaves it out without a height", () => {
    expect(body_mass_index(80, 180)).toBeCloseTo(24.69, 2);
    expect(body_mass_index(80, 0)).toBeNull();
  });

  it("gives body fat by the US Navy tape, the hips needed for women", () => {
    expect(navy_body_fat(someone)).toBeCloseTo(18.36, 1);
    expect(navy_body_fat({ ...someone, sex: "female", neck: 33, waist: 75, height: 165 })).toBeNull();
    expect(navy_body_fat({ sex: "female", height: 165, neck: 33, waist: 75, hips: 100 })).toBeCloseTo(29.4, 1);
    expect(navy_body_fat({ ...someone, sex: "" })).toBeNull();
  });

  it("gives body fat from skinfolds in cm by Jackson-Pollock, needing every site, a sex and an age", () => {
    const folds = { chest: 1, abdomen: 2, thigh: 1.5 };
    expect(caliper_body_fat("jackson_pollock_3", { sex: "male", age: 30, skinfolds: folds })).toBeCloseTo(13.6, 1);
    expect(caliper_body_fat("jackson_pollock_3", { sex: "male", age: 0, skinfolds: folds })).toBeNull();
    expect(caliper_body_fat("jackson_pollock_7", { sex: "male", age: 30, skinfolds: folds })).toBeNull();
    const seven = { chest: 1, midaxillary: 1.2, triceps: 1, subscapular: 1.4, abdomen: 2, suprailiac: 1.5, thigh: 1.5 };
    expect(caliper_body_fat("jackson_pollock_7", { sex: "male", age: 30, skinfolds: seven })).toBeCloseTo(14.1, 1);
  });

  it("splits weight into lean and fat mass with the FFMI", () => {
    const parts = composition(80, 20, 180)!;
    expect(parts.lean_mass).toBeCloseTo(64);
    expect(parts.fat_mass).toBeCloseTo(16);
    expect(parts.ffmi).toBeCloseTo(19.75, 2);
    expect(parts.normalized_ffmi).toBeCloseTo(19.75, 2);
    expect(weight_at_body_fat(64, 15)).toBeCloseTo(75.29, 2);
  });

  it("works out the basal rate by each formula, Katch-McArdle only with a body fat", () => {
    expect(basal_rates(someone)).toEqual({ mifflin_st_jeor: 1780, harris_benedict: expect.closeTo(1853.6, 1), katch_mcardle: null });
    expect(basal_rates({ ...someone, body_fat: 20 }).katch_mcardle).toBeCloseTo(1752.4, 1);
  });

  it("falls back from a formula lacking a measure, and takes body fat from a method when there is no reading", () => {
    const results = calculate({ ...someone, bmr_formula: "katch_mcardle" });
    expect(results.body_fat_source).toBe("navy");
    expect(results.bmr_formula).toBe("katch_mcardle");
    const without_neck = calculate({ ...someone, neck: 0, bmr_formula: "katch_mcardle" });
    expect(without_neck.body_fat).toBeNull();
    expect(without_neck.bmr_formula).toBe("mifflin_st_jeor");
    expect(without_neck.tdee).toBeCloseTo(1780 * 1.375);
  });

  it("plans the goals from the measures, by body fat over BMI when both can", () => {
    const by_bmi = plan_goals(someone, calculate({ ...someone, neck: 0 }), plan);
    expect(by_bmi.map((goal) => [goal.key, goal.value])).toEqual([
      ["weight", 71.3],
      ["body_fat", null],
      ["waist", 90],
      ["calories", 1900],
      ["protein", 160],
      ["fat", 53],
      ["carbs", 196],
    ]);
    const by_body_fat = plan_goals({ ...someone, body_fat: 20 }, calculate({ ...someone, body_fat: 20 }), { ...plan, body_fat: 15 });
    expect(by_body_fat[0]).toMatchObject({ key: "weight", value: 75.3 });
    expect(by_body_fat[1]).toMatchObject({ key: "body_fat", value: 15 });
  });
});

describe("skinfold metrics", () => {
  it("are shown in mm and kept in cm, whatever the length unit", () => {
    const fold = { kind: "length", unit: "", role: "skinfold_thigh" } as const;
    const units = { mass: "lb", length: "in" } as const;
    expect(unit_of(fold, units)).toBe("mm");
    expect(to_stored_value(fold, 12, units)).toBeCloseTo(1.2);
    expect(format_change(fold, -0.15, units)).toBe("-1.5 mm");
  });
});

describe("the calculators store", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 12, 0));
  });

  afterEach(() => vi.useRealTimers());

  function open() {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    store.set_setting("body.sex", "male");
    store.set_setting("body.height", 180);
    store.set_setting("body.birth_date", "1996-01-01");
    store.set_body_reading("weight", "2026-11-10", 80);
    store.set_body_reading("neck", "2026-11-01", 40);
    store.set_body_reading("waist", "2026-11-01", 90);
    return store;
  }

  it("works out from the latest readings by role and the settings", () => {
    const store = open();
    const report = store.get_calculations("2026-11-13");

    expect(report.measures).toMatchObject({ sex: "male", age: 30, height: 180, weight: 80, neck: 40, waist: 90, activity: "light" });
    expect(report.sources.weight?.reading).toEqual({ date: "2026-11-10", value: 80 });
    expect(report.calculations.navy_body_fat).toBeCloseTo(18.36, 1);
    expect(report.goals.find((goal) => goal.key === "waist")).toMatchObject({ value: 90, current: null, holder: { metric_id: "waist" } });
    expect(report.goals.find((goal) => goal.key === "calories")).toMatchObject({ current: 2000, holder: "diet" });
  });

  it("reads skinfolds from metrics with a skinfold role", () => {
    const store = open();
    for (const [site, value] of [["chest", 1], ["abdomen", 2], ["thigh", 1.5]] as const) {
      const id = store.save_body_metric({ name: `${site} skinfold`, kind: "length", role: `skinfold_${site}` });
      store.set_body_reading(id, "2026-11-12", value);
    }

    const report = store.get_calculations("2026-11-13");

    expect(report.measures.skinfolds).toEqual({ chest: 1, abdomen: 2, thigh: 1.5 });
    expect(report.calculations.jackson_pollock_3).toBeCloseTo(13.6, 1);
  });

  it("sets the goals named once, and only those that differ", () => {
    const store = open();

    expect(store.apply_calculated_goals(["weight", "waist", "calories", "protein"], "2026-11-13")).toBe(4);
    expect(store.list_body_metrics().find((metric) => metric.id === "weight")?.goal).toBeCloseTo(71.3);
    expect(store.list_body_metrics().find((metric) => metric.id === "waist")?.goal).toBe(90);
    expect(store.get_settings()["diet.target_calories"]).toBeGreaterThan(2000);
    expect(store.get_settings()["diet.target_fat"]).toBe(65);
    expect(store.apply_calculated_goals(["weight", "waist"], "2026-11-13")).toBe(0);
  });

  it("keeps the turned-on goals following the plan after every change, and leaves the rest", () => {
    const store = open();
    store.set_setting("calculators.follow_diet_targets", true);
    const calories = store.get_settings()["diet.target_calories"] as number;

    store.set_body_reading("weight", "2026-11-13", 90);

    expect(store.get_settings()["diet.target_calories"]).toBeGreaterThan(calories);
    expect(store.list_body_metrics().find((metric) => metric.id === "weight")?.goal).toBe(0);
    store.set_setting("calculators.follow_body_goals", true);
    expect(store.list_body_metrics().find((metric) => metric.id === "weight")?.goal).toBeCloseTo(71.3);
  });
});
