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
  body_fat_needs,
  daily_energy_change,
  missing_needs,
  plan_goals,
  weight_at_body_fat,
  type GoalPlan,
  type Measures,
} from "../src/shared/calculators/formulas.ts";
import { target_of } from "../src/shared/diet/labels.ts";
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

const plan: GoalPlan = { weekly_change: -0.5, protein_per_kg: 2, fat_percent: 25 };

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
    expect(without_neck.body_fat_source).toBe("bmi");
    expect(without_neck.body_fat).toBeCloseTo(20.3, 1);
    const without_age = calculate({ ...someone, neck: 0, age: 0, bmr_formula: "katch_mcardle" });
    expect(without_age.body_fat).toBeNull();
    expect(without_age.bmr_formula).toBeNull();
    const without_sex = calculate({ ...someone, sex: "", neck: 0, bmr_formula: "katch_mcardle" });
    expect(without_sex.bmr_formula).toBe("mifflin_st_jeor");
    expect(without_sex.tdee).toBeCloseTo((1780 - 83) * 1.375);
  });

  it("plans the daily targets from the measures and the weekly change", () => {
    const goals = plan_goals(someone, calculate({ ...someone, neck: 0 }), plan);
    expect(goals.map((goal) => [goal.key, goal.value])).toEqual([
      ["calories", 1900],
      ["protein", 160],
      ["fat", 53],
      ["carbs", 196],
    ]);
    expect(daily_energy_change(-0.5)).toBeCloseTo(-550);
  });

  it("names only the measures a body fat method still lacks", () => {
    expect(missing_needs(body_fat_needs("navy", "female"), { ...someone, sex: "female" })).toEqual(["hips"]);
    expect(missing_needs(body_fat_needs("jackson_pollock_3", "male"), { ...someone, skinfolds: { chest: 1 } })).toEqual(["abdomen", "thigh"]);
    expect(missing_needs(body_fat_needs("bmi", ""), { ...someone, sex: "", age: 0 })).toEqual(["sex", "age"]);
    expect(missing_needs(body_fat_needs("reading", "male"), someone)).toEqual(["body_fat"]);
  });
});

describe("skinfold metrics", () => {
  it("are shown in mm and kept in cm, whatever the length unit", () => {
    const fold = { kind: "length", unit: "", role: "skinfold_thigh" } as const;
    const units = { mass: "lb", length: "in", distance: "mi", energy: "kcal" } as const;
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
    store.set_body_reading("height", "2026-01-01", 180);
    store.set_setting("body.birth_date", "1996-01-01");
    store.set_body_reading("weight", "2026-11-10", 80);
    store.set_body_reading("neck", "2026-11-01", 40);
    store.set_body_reading("waist", "2026-11-01", 90);
    return store;
  }

  it("works out from the latest readings by role, the height a reading too, and the settings", () => {
    const store = open();
    const report = store.get_calculations("2026-11-13");

    expect(report.measures).toMatchObject({ sex: "male", age: 30, height: 180, weight: 80, neck: 40, waist: 90, activity: "light" });
    expect(report.sources.weight?.reading).toEqual({ date: "2026-11-10", value: 80 });
    expect(report.sources.height?.reading).toEqual({ date: "2026-01-01", value: 180 });
    expect(report.calculations.bmi).toBeCloseTo(80 / 1.8 ** 2);
    expect(report.calculations.navy_body_fat).toBeCloseTo(18.36, 1);
    expect(report.goals.find((goal) => goal.key === "calories")).toMatchObject({ current: 2000 });
    expect(store.get_calculations("2025-12-31").measures.height).toBe(0);
  });

  it("reads skinfolds from metrics with a skinfold role", () => {
    const store = open();
    for (const [site, value] of [["chest", 1], ["abdomen", 2], ["thigh", 1.5]] as const) {
      store.set_body_reading(`skinfold_${site}`, "2026-11-12", value);
    }

    const report = store.get_calculations("2026-11-13");

    expect(report.measures.skinfolds).toEqual({ chest: 1, abdomen: 2, thigh: 1.5 });
    expect(report.calculations.jackson_pollock_3).toBeCloseTo(13.6, 1);
  });

  it("sets the daily targets named once, and only those that differ", () => {
    const store = open();

    expect(store.apply_calculated_goals(["calories", "protein"], "2026-11-13")).toBe(2);
    expect(store.get_settings()["diet.target_calories"]).toBeGreaterThan(2000);
    // Fat was not named, so it still follows the target preset, while the plan's protein overrides any preset.
    expect(store.get_settings()["diet.target_fat"]).toBeUndefined();
    store.set_setting("diet.targets", "eu");
    expect(target_of(store.get_settings(), "protein")).toBe(store.get_settings()["diet.target_protein"]);
    expect(target_of(store.get_settings(), "fat")).toBe(70);
    expect(store.apply_calculated_goals(["calories", "protein"], "2026-11-13")).toBe(0);
  });

  it("keeps the diet's targets following the plan after every change, and leaves the body goals alone", () => {
    const store = open();
    store.set_setting("calculators.follow_diet_targets", true);
    const calories = store.get_settings()["diet.target_calories"] as number;

    store.set_body_reading("weight", "2026-11-13", 90);

    expect(store.get_settings()["diet.target_calories"]).toBeGreaterThan(calories);
    expect(store.list_body_metrics().find((metric) => metric.id === "weight")?.goal).toBe(0);
  });

  it("carries an old stored body plan over into the metrics' goals once, keeping goals already set", () => {
    const database = new DatabaseSync(":memory:");
    open_store(database);
    const store = bind_methods(() => database, () => undefined);
    store.set_setting("body.sex", "male");
    store.set_setting("body.birth_date", "1996-01-01");
    store.set_body_reading("height", "2026-01-01", 180);
    store.set_body_reading("weight", "2026-11-10", 80);
    store.save_body_metric({ id: "waist", name: "Waist", kind: "length", role: "waist", goal: 85 });
    for (const [key, value] of [["calculators.goal_bmi", 22], ["calculators.goal_waist_to_height", 0.45], ["calculators.follow_body_goals", true]] as const) {
      database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
    }

    open_store(database);
    const goals = () => Object.fromEntries(store.list_body_metrics().map((metric) => [metric.id, metric.goal]));
    expect(goals()).toMatchObject({ weight: 71.3, bodyfat: 0, waist: 85 });
    expect(store.get_settings()["calculators.goal_bmi"]).toBeUndefined();

    store.save_body_metric({ id: "weight", name: "Weight", kind: "weight", goal: 0 });
    open_store(database);
    expect(goals()).toMatchObject({ weight: 0, waist: 85 });
  });
});
