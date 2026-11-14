// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Toasts } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { forget_wger_index } from "../src/shared/workouts/wger.ts";
import { calls, set_page_api } from "../src/web/api.ts";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";
import { WorkoutsView } from "../src/web/workouts/index.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  forget_wger_index();
});

// The page's calls answered by a real store on a throwaway database, as the phone's page answers them.
function open_page(settings: Record<string, unknown> = {}) {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const store = bind_methods(() => database, () => undefined);
  for (const [key, value] of Object.entries(settings)) store.set_setting(key, value);
  const calls = Object.fromEntries(Object.entries(store).map(([name, method]) => [name, async (...args: unknown[]) => (method as (...args: unknown[]) => unknown)(...args)])) as Client<FitnessMethods>;
  set_page_api({ host: "web", calls, device: null, on_change: () => () => undefined });
  return store;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function plan(store: ReturnType<typeof open_page>) {
  const bench = store.save_exercise({ name: "Bench Press", measurement: "weight", categories: ["Push"] });
  const program = store.save_program({ name: "PPL" });
  const session = store.save_program_session(program, { name: "Push", entries: [{ exercise_id: bench, sets: 2, reps: 5, weight: 60, rest: 90, progression: { type: "linear", increment: 2.5, successes: 1 } }] });
  return { bench, program, session };
}

function view(parts: string[]) {
  return render(
    <>
      <WorkoutsView parts={parts} />
      <Dialogs />
      <Toasts />
    </>,
  );
}

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe("workouts log", () => {
  it("starts a session, logs a set in the units shown, and finishes it to progress the plan", async () => {
    const store = open_page({ mass_unit: "lb" });
    const { session } = plan(store);
    view(["log"]);

    fireEvent.change(await screen.findByRole("combobox", { name: "Session" }), { target: { value: session } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    const first_set = await screen.findByRole("listitem", { name: "Bench Press set 1" });
    expect((within(first_set).getByRole("textbox", { name: "Weight" }) as HTMLInputElement).value).toBe("132.28");

    commit(within(first_set).getByRole("textbox", { name: "Weight" }), "135");
    commit(within(first_set).getByRole("textbox", { name: "Reps" }), "6");
    await waitFor(() => expect(store.list_workouts(today())[0]!.entries[0]!.sets[0]!.reps).toBe(6));
    expect(store.list_workouts(today())[0]!.entries[0]!.sets[0]!.weight).toBeCloseTo(61.235, 3);

    fireEvent.click(screen.getByRole("button", { name: "Add set to Bench Press" }));
    await screen.findByRole("listitem", { name: "Bench Press set 3" });
    expect(screen.getByText(/3 set\(s\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Finish" }));
    // The increase goes on the last weight lifted, the copied 60 kg set.
    expect(await screen.findByText("Bench Press: 132.3 → 137.8 lb")).toBeTruthy();
    expect(await screen.findByText("Finished")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Rest / })).toBeNull();
    expect(store.get_workout_library().programs[0]!.sessions[0]!.entries[0]!.weight).toBe(62.5);
  });

  it("adds an exercise mid-workout, steps through days, and keeps a deleted exercise's sets", async () => {
    const store = open_page();
    const curl = store.save_exercise({ name: "Curl" });
    view(["log"]);

    fireEvent.click(await screen.findByRole("button", { name: "Empty Workout" }));
    const add = await screen.findByRole("combobox", { name: "Add an exercise" });
    fireEvent.change(add, { target: { value: curl } });
    expect(await screen.findByRole("listitem", { name: "Curl set 1" })).toBeTruthy();
    // An exercise added by hand rests for the default.
    expect(screen.getByRole("button", { name: "Rest 1:30" })).toBeTruthy();

    await calls().delete_exercise(curl);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(await screen.findByText("Nothing logged on this day.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByRole("listitem", { name: "Deleted exercise set 1" })).toBeTruthy();
  });

  it("counts a rest down from the plan's rest, pauses it, and says when it is over without a chime when that is off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const audio = vi.fn();
    vi.stubGlobal("AudioContext", audio);
    const store = open_page({ "workouts.rest_sound": false });
    const { session } = plan(store);
    store.start_workout(today(), session, new Date().toISOString());
    view(["log"]);

    fireEvent.click((await screen.findAllByRole("button", { name: "Rest 1:30" }))[0]!);
    const timer = screen.getByRole("timer", { name: "Rest timer" });
    expect(within(timer).getByText("1:30")).toBeTruthy();
    fireEvent.click(within(timer).getByRole("button", { name: "Add 30 seconds" }));
    expect(within(timer).getByText("2:00")).toBeTruthy();
    fireEvent.click(within(timer).getByRole("button", { name: "Pause" }));
    expect(within(timer).getByText("paused")).toBeTruthy();
    fireEvent.click(within(timer).getByRole("button", { name: "Resume" }));

    await vi.advanceTimersByTimeAsync(121_000);
    expect(await screen.findByText("Rest over.")).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(audio).not.toHaveBeenCalled();
  });
});

describe("workouts plans and library", () => {
  it("adds a program and a session with targets, then starts it today", async () => {
    const store = open_page({ mass_unit: "lb" });
    store.save_exercise({ name: "Squat", measurement: "weight" });
    view(["programs"]);

    fireEvent.change(await screen.findByRole("textbox", { name: "New program" }), { target: { value: "Strength" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Program" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Session" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Day A" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Exercise" }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Exercise 1" }), { target: { value: store.get_workout_library().exercises[0]!.id } });
    commit(within(dialog).getByRole("textbox", { name: "Target reps" }), "5");
    commit(within(dialog).getByRole("textbox", { name: "Target weight" }), "225");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Progression" }), { target: { value: "double" } });
    expect((within(dialog).getByRole("textbox", { name: "Max reps" }) as HTMLInputElement).value).toBe("10");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("3 × Squat — 5 reps × 225 lb · 90s rest")).toBeTruthy();
    const entry = store.get_workout_library().programs[0]!.sessions[0]!.entries[0]!;
    expect(entry.weight).toBeCloseTo(102.058, 3);
    expect(entry.progression).toMatchObject({ type: "double", min_reps: 6, max_reps: 10 });
    expect(entry.progression.increment).toBeCloseTo(1.134, 3);

    fireEvent.click(screen.getByRole("button", { name: "Start Day A today" }));
    await waitFor(() => expect(store.list_workouts(today()).map((workout) => workout.name)).toEqual(["Strength - Day A"]));
  });

  it("looks an exercise up in wger, fills the form from it, and saves it to the library", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.includes("/language/")
            ? { results: [{ id: 2, short_name: "en" }] }
            : { results: [{ id: 9, category: { name: "Cardio" }, equipment: [], muscles: [{ name: "Quadriceps femoris", name_en: "Quads" }], translations: [{ language: 2, name: "Rowing Machine" }] }] },
        ),
      ),
    );
    const store = open_page();
    view(["exercises"]);

    fireEvent.click(await screen.findByRole("button", { name: "Add Exercise" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search the wger exercise database" }), { target: { value: "row" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: /Rowing Machine/ }));
    expect((within(dialog).getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Rowing Machine");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.get_workout_library().exercises).toMatchObject([{ name: "Rowing Machine", measurement: "cardio", muscles: ["Quads"] }]));
    expect(store.get_workout_library().exercises[0]!.categories).toEqual([store.get_workout_library().categories[0]!.id]);
    expect(store.get_workout_library().categories[0]).toMatchObject({ name: "Cardio", parent_id: null });
    expect(await screen.findByRole("cell", { name: "Rowing Machine" })).toBeTruthy();
  });

  it("files exercises under nested categories, opened like folders, and renames one keeping what is inside", async () => {
    const store = open_page();
    store.save_exercise({ name: "Fly", categories: ["Push/Chest"] });
    view(["categories"]);

    fireEvent.click(await screen.findByRole("button", { name: "Push" }));
    expect(await screen.findByRole("button", { name: "Chest" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("All categories › Push");
    fireEvent.click(screen.getByRole("button", { name: "All categories" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename Push" }));
    const field = screen.getByRole("textbox", { name: "Rename Push" });
    fireEvent.change(field, { target: { value: "Upper" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(store.list_workout_categories().map((category) => category.path.join("/"))).toEqual(["Upper", "Upper/Chest"]));
    expect(store.get_workout_library().exercises[0]!.categories).toEqual([store.list_workout_categories()[1]!.id]);
  });

  it("reports weekly totals against the target and personal bests", async () => {
    const store = open_page({ "workouts.weekly_target": 1 });
    const { session } = plan(store);
    store.start_workout(today(), session, new Date().toISOString());
    view(["reports"]);

    expect(await screen.findByRole("img", { name: "Volume per week" })).toBeTruthy();
    expect(screen.getAllByText("1 / 1").length).toBe(1);
    expect(screen.getByText("60 kg · est. 1RM 70 kg")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Report on Bench Press" }));
    expect(await screen.findByText("Most Reps In A Set")).toBeTruthy();
  });
});

describe("workouts settings", () => {
  it("saves its settings and imports the Trilium add-on's file in the units set", async () => {
    const store = open_page({ mass_unit: "lb" });
    render(
      <>
        <SettingsView />
        <Toasts />
      </>,
    );

    commit(await screen.findByRole("textbox", { name: "Workouts per week" }), "4");
    await waitFor(() => expect(store.get_settings()["workouts.weekly_target"]).toBe(4));

    const file = new File([JSON.stringify({ exercises: { e1: { name: "Deadlift" } }, programs: {}, log: { "2026-08-01": [{ id: "w1", name: "Pull", entries: [{ exerciseId: "e1", sets: [{ reps: 5, weight: 225 }] }] }] } })], "database.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("Trilium database file"), { target: { files: [file] } });
    expect(await screen.findByText(/Imported 1 exercise\(s\), 0 session\(s\) in 0 new program\(s\) and 1 workout\(s\)/)).toBeTruthy();
    expect(store.list_workouts("2026-08-01")[0]!.entries[0]!.sets[0]!.weight).toBeCloseTo(102.058, 3);
  });
});
