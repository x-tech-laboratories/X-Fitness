// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { CalculatorsView } from "../src/web/calculators/index.tsx";
import { DietView } from "../src/web/diet/index.tsx";
import { GoalsView } from "../src/web/goals/index.tsx";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";
import { WorkoutsView } from "../src/web/workouts/index.tsx";

// The page's calls answered by a real store on a throwaway database, with a man of 30 at 180 cm and 80 kg.
function fake_page(): FitnessMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "web", calls: calls as unknown as Client<FitnessMethods>, device: null, on_change: () => () => undefined });
  methods.set_setting("body.sex", "male");
  methods.set_body_reading("height", "2026-01-01", 180);
  methods.set_setting("body.birth_date", "1996-01-01");
  methods.set_body_reading("weight", "2026-11-10", 80);
  methods.set_body_reading("neck", "2026-11-10", 40);
  methods.set_body_reading("waist", "2026-11-10", 90);
  return methods;
}

function show(section: "calculators" | "goals" | "training") {
  const view = section === "calculators" ? <CalculatorsView /> : section === "goals" ? <GoalsView /> : <WorkoutsView parts={["training"]} />;
  return render(<>{view}<Dialogs /></>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 13, 12, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("calculators", () => {
  it("fills in from the readings and works out again from numbers typed over them, saving nothing", async () => {
    const store = fake_page();
    show("calculators");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Calculators");
    expect(await screen.findByText("24.7 · Healthy weight")).toBeTruthy();
    expect(screen.getAllByText("2026-11-10")).not.toHaveLength(0);
    const weight = screen.getByRole("textbox", { name: "Weight" });
    fireEvent.change(weight, { target: { value: "90" } });
    fireEvent.blur(weight);
    expect(await screen.findByText("27.8 · Overweight")).toBeTruthy();
    expect(screen.getByText("Changed")).toBeTruthy();
    expect(store.get_body_day("2026-11-13").rows[0]?.value).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset Weight" }));
    expect(await screen.findByText("24.7 · Healthy weight")).toBeTruthy();
    expect(screen.queryByText("Changed")).toBeNull();
    fireEvent.change(weight, { target: { value: "90" } });
    fireEvent.blur(weight);
    fireEvent.click(await screen.findByRole("button", { name: "Use my readings" }));
    expect(await screen.findByText("24.7 · Healthy weight")).toBeTruthy();
  });

  it("logs a body fat worked out by the Navy method as today's reading", async () => {
    const store = fake_page();
    show("calculators");

    fireEvent.click(await screen.findByRole("button", { name: "Log the US Navy body fat as today's Body Fat" }));
    await waitFor(() => expect(store.get_body_day("2026-11-13").rows.find((row) => row.metric.id === "bodyfat")?.value).toBe(18.4));
  });

  it("names in the body fat table only the measures each method still lacks, with skinfolds folded away", async () => {
    fake_page();
    show("calculators");

    const table = await screen.findByRole("table", { name: "Body fat by method" });
    expect(within(table).getByRole("row", { name: /^US Navy tape/ }).textContent).toContain("18.4%");
    expect(within(table).getByRole("row", { name: /^US Navy tape/ }).textContent).toContain("Used");
    expect(within(table).getByRole("row", { name: /^3-site calipers/ }).textContent).toContain("Needs the chest, belly, and thigh skinfolds.");
    expect(within(table).getByRole("row", { name: /^Your reading/ }).textContent).toContain("Needs a body fat reading.");
    expect(screen.getByText("Skinfolds").closest("details")?.open).toBe(false);

    fireEvent.change(screen.getByRole("combobox", { name: "Sex" }), { target: { value: "female" } });
    await waitFor(() => expect(within(table).getByRole("row", { name: /^US Navy tape/ }).textContent).toContain("Needs the hips."));
  });
});

describe("skinfold sites", () => {
  it("shows every site numbered above the skinfold fields, each field carrying its number", async () => {
    fake_page();
    show("calculators");

    const group = (await screen.findByText("Skinfolds")).closest("details")!;
    expect(within(group).getByRole("img", { name: /^Where to pinch each skinfold on your right side/ })).toBeTruthy();
    const legend = within(group).getAllByRole("listitem") as HTMLLIElement[];
    expect(legend.map((item) => `${item.value} ${item.textContent}`)).toEqual(["1 Chest", "2 Belly", "3 Thigh", "4 Back of arm", "5 Above hip", "6 Side of ribs", "7 Shoulder blade"]);
    expect(within(group).getByRole("textbox", { name: "2. Belly skinfold" })).toBeTruthy();
    expect(within(group).getByRole("textbox", { name: "7. Shoulder blade skinfold" })).toBeTruthy();
  });
});

describe("goals", () => {
  it("lays the page out as where I am, where I want to be and how I get there, reading sex and age only", async () => {
    fake_page();
    show("goals");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Goals");
    expect((await screen.findAllByRole("heading", { level: 2 })).map((heading) => heading.textContent)).toEqual(["Where I am now", "Where I want to be", "How I get there"]);
    expect(screen.getByText("Male")).toBeTruthy();
    expect(screen.getByText("30 years")).toBeTruthy();
    expect(screen.getByText("180 cm")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Sex" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Activity" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "BMR formula" })).toBeNull();
  });

  it("lists only the goals set, weight, body fat and waist first, each with how far it is from the latest reading", async () => {
    const store = fake_page();
    store.set_body_goal("hips", 95);
    store.set_body_goal("waist", 84);
    store.set_body_goal("weight", 75);
    store.set_body_goal("body_fat", 15);
    show("goals");

    const section = (await screen.findByRole("heading", { name: "Where I want to be" })).closest("section")!;
    await waitFor(() => expect([...section.querySelectorAll(".card-head strong")].map((title) => title.textContent)).toEqual(["Weight", "Body fat", "Waist", "Hips"]));
    expect(within(section).getByText("now 80 kg · 5 kg to lose · BMI 23.1")).toBeTruthy();
    expect(within(section).getByText("now 90 cm · 6 cm to go down · 0.47 of your height")).toBeTruthy();
    expect(within(section).getByText(/^now [\d.]+ ?% \(estimated\) · [\d.]+ ?% to go down$/)).toBeTruthy();
    expect(within(section).queryByText(/now .* · .*95/)).toBeNull();
    expect((within(section).getByRole("textbox", { name: "Hips goal" }) as HTMLInputElement).value).toBe("95");
    expect(within(section).queryByText(/apart from the metrics/)).toBeTruthy();
    expect(within(section).queryByText(/metrics' goals|goals of your/)).toBeNull();
  });

  it("adds a goal from the menu of those not set, edits and removes it, and keeps it with no metric for it", async () => {
    const store = fake_page();
    store.delete_body_metric("hips");
    show("goals");
    const goals = () => Object.fromEntries(store.list_body_goals().map((goal) => [goal.key, goal.value]));

    expect(await screen.findByText("No goals yet; add one with Add goal.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Weight", "Body fat", "Waist", "Neck", "Chest", "Underbust", "Hips", "Upper arm", "Wrist", "Thigh", "Knee", "Calf", "Ankle"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Hips" }));
    const hips = await screen.findByRole("textbox", { name: "Hips goal" });
    expect(store.list_body_goals()).toEqual([]);
    fireEvent.change(hips, { target: { value: "96" } });
    fireEvent.blur(hips);
    await waitFor(() => expect(goals()).toEqual({ hips: 96 }));
    expect(screen.queryByText(/^now /)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    expect(within(await screen.findByRole("menu")).queryByRole("menuitem", { name: "Hips" })).toBeNull();
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Weight" }));
    const weight = await screen.findByRole("textbox", { name: "Weight goal" });
    fireEvent.change(weight, { target: { value: "75" } });
    fireEvent.blur(weight);
    await waitFor(() => expect(goals()).toEqual({ weight: 75, hips: 96 }));
    const edited = screen.getByRole("textbox", { name: "Weight goal" });
    fireEvent.change(edited, { target: { value: "77.5" } });
    fireEvent.blur(edited);
    await waitFor(() => expect(goals()).toEqual({ weight: 77.5, hips: 96 }));

    fireEvent.click(screen.getByRole("button", { name: "Remove the hips goal" }));
    await waitFor(() => expect(goals()).toEqual({ weight: 77.5 }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Hips goal" })).toBeNull());
  });

  it("fills the weight goal in from a BMI of 22 and the waist from half the height, with nothing tying the weight to body fat", async () => {
    const store = fake_page();
    store.set_body_goal("weight", 90);
    store.set_body_goal("waist", 100);
    store.set_body_goal("body_fat", 15);
    show("goals");
    const goal_of = (key: string) => store.list_body_goals().find((goal) => goal.key === key)?.value;

    fireEvent.click(await screen.findByRole("button", { name: "Set the goal weight for a BMI of 22" }));
    await waitFor(() => expect(goal_of("weight")).toBeCloseTo(71.3));
    expect(await screen.findByText(/now 80 kg · 8\.7 kg to lose/)).toBeTruthy();
    expect(screen.getByText(/^A healthy BMI at your height is/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set the goal waist to half your height" }));
    await waitFor(() => expect(goal_of("waist")).toBe(90));
    expect(goal_of("body_fat")).toBe(15);
    expect(screen.queryByText(/body fat at today's lean mass/)).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Body fat for the goal weight" })).toBeNull();
    expect(screen.queryByRole("button", { name: /goal weight for .*% body fat/ })).toBeNull();
  });

  it("stores Lose, Keep and Gain as the signed weekly change", async () => {
    const store = fake_page();
    show("goals");
    const weekly = () => store.get_settings()["calculators.weekly_change"];

    fireEvent.click(await screen.findByRole("radio", { name: "Lose" }));
    await waitFor(() => expect(weekly()).toBe(-0.5));
    const rate = await screen.findByRole("textbox", { name: "Rate" });
    fireEvent.change(rate, { target: { value: "1" } });
    fireEvent.blur(rate);
    await waitFor(() => expect(weekly()).toBe(-1));
    fireEvent.click(screen.getByRole("radio", { name: "Gain" }));
    await waitFor(() => expect(weekly()).toBe(1));
    fireEvent.click(screen.getByRole("radio", { name: "Keep" }));
    await waitFor(() => expect(weekly()).toBe(0));
    expect(screen.queryByRole("textbox", { name: "Rate" })).toBeNull();
  });

  it("applies the daily targets once, or keeps them following the plan with no button", async () => {
    const store = fake_page();
    show("goals");

    fireEvent.click(await screen.findByRole("button", { name: "Apply the daily targets once" }));
    await waitFor(() => expect(store.get_settings()["diet.target_protein"]).toBe(128));
    expect(store.get_settings()["calculators.follow_diet_targets"]).toBe(false);
    await waitFor(() => expect((screen.getByRole("button", { name: "Apply the daily targets once" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole("switch", { name: "Keep the diet's daily targets set to these" }));
    await waitFor(() => expect(store.get_settings()["calculators.follow_diet_targets"]).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Apply the daily targets once" })).toBeNull());
  });

  it("projects the weight goal once one is set, and warns when the pace heads away from it", async () => {
    const store = fake_page();
    store.set_body_goal("weight", 75);
    store.set_setting("calculators.weekly_change", 0.5);
    show("goals");

    expect(await screen.findByText("When you get there")).toBeTruthy();
    expect(screen.getByText("5 kg to lose")).toBeTruthy();
    expect(screen.getByText("The plan heads the other way")).toBeTruthy();
    expect(screen.getAllByText("Needs two weights a week apart")).not.toHaveLength(0);
    expect(screen.getByText("The plan gains weight, but the goal of 75 kg is below your 80 kg.")).toBeTruthy();
  });
});

describe("training calculators", () => {
  it("estimates a one-rep max from the best set with the plates for each share of it", async () => {
    const store = fake_page();
    const squat = store.save_exercise({ name: "Squat", measurement: "weight" });
    const workout = store.start_workout("2026-11-12", null, "");
    const entry = store.add_workout_exercise(workout, squat);
    store.update_workout_set(store.add_workout_set(entry), { reps: 5, weight: 100 });
    show("training");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Training");
    expect(await screen.findAllByText("116.7 kg")).toHaveLength(2);
    expect(screen.getByRole("row", { name: /^90%/ }).textContent).toContain("105 kg31 × 25, 1 × 15, 1 × 2.5");
    const reps = screen.getByRole("textbox", { name: "Reps" });
    fireEvent.change(reps, { target: { value: "1" } });
    fireEvent.blur(reps);
    expect(await screen.findAllByText("100 kg")).not.toHaveLength(0);
  });

  it("loads a bar with the plates kept under Settings → Workouts, where the training settings now live", async () => {
    const store = fake_page();
    render(<SettingsView />);

    const plates = await screen.findByLabelText("Plates you have");
    fireEvent.change(plates, { target: { value: "15, 5" } });
    fireEvent.blur(plates);
    await waitFor(() => expect(store.get_settings()["calculators.plates"]).toEqual([15, 5]));
    expect(screen.getByRole("textbox", { name: "Weights MET" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Add workouts to the diary's calorie target" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Squat" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Activity" })).toBeNull();
    cleanup();

    show("training");
    expect(await screen.findByText(/Bar 20 kg · plates 15, 5/)).toBeTruthy();
    expect(screen.queryByLabelText("Plates you have")).toBeNull();
    const target = screen.getByRole("textbox", { name: "Weight to load" });
    fireEvent.change(target, { target: { value: "60" } });
    fireEvent.blur(target);
    expect(await screen.findByText("1 × 15, 1 × 5")).toBeTruthy();
  });

  it("shows the energy each recent workout burned under Workouts → Reports", async () => {
    const store = fake_page();
    const press = store.save_exercise({ name: "Press", measurement: "weight" });
    const workout = store.start_workout("2026-11-12", null, "2026-11-12T10:00:00.000Z");
    store.update_workout_set(store.add_workout_set(store.add_workout_exercise(workout, press)), { reps: 5, weight: 40 });
    store.finish_workout(workout, "2026-11-12T11:00:00.000Z");
    render(<WorkoutsView parts={["reports"]} />);

    const table = await screen.findByRole("table", { name: "Energy burned in the last 30 days" });
    expect(table.textContent).toContain("400 kcal");
  });

  it("adds the day's workouts to the diary's calorie target when told to", async () => {
    const store = fake_page();
    store.set_setting("calculators.eat_back_workouts", true);
    const press = store.save_exercise({ name: "Press", measurement: "weight" });
    const workout = store.start_workout("2026-11-13", null, "2026-11-13T10:00:00.000Z");
    store.update_workout_set(store.add_workout_set(store.add_workout_exercise(workout, press)), { reps: 5, weight: 40 });
    store.finish_workout(workout, "2026-11-13T11:00:00.000Z");
    render(<DietView parts={["diary"]} />);

    expect(await screen.findByText("The calorie target includes 400 kcal burned in workouts.")).toBeTruthy();
  });
});
