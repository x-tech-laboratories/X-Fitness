// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { CalculatorsView } from "../src/web/calculators/index.tsx";
import { DietView } from "../src/web/diet/index.tsx";
import { GoalsView } from "../src/web/goals/index.tsx";
import { WorkoutsView } from "../src/web/workouts/index.tsx";

// The page's calls answered by a real store on a throwaway database, with a man of 30 at 180 cm and 80 kg.
function fake_page(): FitnessMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "web", calls: calls as unknown as Client<FitnessMethods>, device: null, on_change: () => () => undefined });
  methods.set_setting("body.sex", "male");
  methods.set_setting("body.height", 180);
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
    expect(await screen.findByText("24.7")).toBeTruthy();
    expect(screen.getByText("Weight on 2026-11-10")).toBeTruthy();
    const weight = screen.getByRole("textbox", { name: "Weight" });
    fireEvent.change(weight, { target: { value: "90" } });
    fireEvent.blur(weight);
    expect(await screen.findByText("27.8")).toBeTruthy();
    expect(store.get_body_day("2026-11-13").rows[0]?.value).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use my readings" }));
    expect(await screen.findByText("24.7")).toBeTruthy();
  });

  it("logs a body fat worked out by the Navy method as today's reading", async () => {
    const store = fake_page();
    show("calculators");

    fireEvent.click(await screen.findByRole("button", { name: "Log the US Navy body fat as today's Body Fat" }));
    await waitFor(() => expect(store.get_body_day("2026-11-13").rows.find((row) => row.metric.id === "bodyfat")?.value).toBe(18.4));
  });

  it("sets the goals from the plan and keeps the diet's targets following it", async () => {
    const store = fake_page();
    show("goals");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Goals");
    fireEvent.click(await screen.findByRole("button", { name: "Use the plan's weight" }));
    await waitFor(() => expect(store.list_body_metrics().find((metric) => metric.id === "weight")?.goal).toBeCloseTo(71.3));
    fireEvent.click(screen.getByRole("switch", { name: "Diet targets follow the plan" }));
    await waitFor(() => expect(store.get_settings()["calculators.follow_diet_targets"]).toBe(true));
    expect(store.get_settings()["diet.target_protein"]).toBe(128);
  });

  it("projects the weight goal once one is set", async () => {
    const store = fake_page();
    store.save_body_metric({ id: "weight", name: "Weight", kind: "weight", goal: 75 });
    show("goals");

    expect(await screen.findByText("Time to goal")).toBeTruthy();
    expect(screen.getByText("-5 kg")).toBeTruthy();
    expect(screen.getByText("Needs two weights a week apart")).toBeTruthy();
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

  it("loads a bar with the plates set and keeps a new list of plates", async () => {
    const store = fake_page();
    show("training");

    const target = await screen.findByRole("textbox", { name: "Weight to load" });
    fireEvent.change(target, { target: { value: "60" } });
    fireEvent.blur(target);
    expect(await screen.findByText("1 × 20")).toBeTruthy();
    const plates = screen.getByLabelText("Plates you have");
    fireEvent.change(plates, { target: { value: "15, 5" } });
    fireEvent.blur(plates);
    await waitFor(() => expect(store.get_settings()["calculators.plates"]).toEqual([15, 5]));
    expect(await screen.findByText("1 × 15, 1 × 5")).toBeTruthy();
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
