// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { BodyView } from "../src/web/body/index.tsx";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";

// The page's calls answered by a real store on a throwaway database, as a host would.
function fake_page(): FitnessMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "web", calls: calls as unknown as Client<FitnessMethods>, device: null, on_change: () => () => undefined });
  return methods;
}

function show(parts: string[]) {
  return render(<><BodyView parts={parts} /><Dialogs /></>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("body log", () => {
  it("saves a reading when its field is left, with the change since the one before", async () => {
    const store = fake_page();
    store.set_body_reading("weight", "2026-11-08", 80);
    show([]);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Log");
    const weight = await screen.findByRole("textbox", { name: "Weight" });
    expect(screen.getByRole("row", { name: /Weight/ }).textContent).toContain("80 kg on 2026-11-08");
    fireEvent.change(weight, { target: { value: "81.5" } });
    fireEvent.blur(weight);
    await waitFor(() => expect(store.get_body_day("2026-11-10").rows[0]?.value).toBe(81.5));
    await waitFor(() => expect(screen.getByRole("row", { name: /Weight/ }).textContent).toContain("(+1.5 kg)"));
  });

  it("shows readings in pounds and keeps them in kg, and gives BMI once a height is set", async () => {
    const store = fake_page();
    store.set_setting("mass_unit", "lb");
    store.set_body_reading("height", "2026-01-01", 180);
    show(["log"]);

    const weight = await screen.findByRole("textbox", { name: "Weight" });
    fireEvent.change(weight, { target: { value: "180" } });
    fireEvent.blur(weight);
    await waitFor(() => expect(store.get_body_day("2026-11-10").rows[0]?.value).toBeCloseTo(81.65, 2));
    expect(await screen.findByText("BMI 25.2, from 180 lb on 2026-11-10.")).toBeTruthy();
  });

  it("steps between days and keeps each day's note", async () => {
    const store = fake_page();
    store.set_body_note("2026-11-09", "travel");
    show(["log"]);

    await screen.findByRole("textbox", { name: "Weight" });
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(((await screen.findByDisplayValue("travel")) as HTMLTextAreaElement).value).toBe("travel");
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const note = await screen.findByLabelText("Note");
    await waitFor(() => expect((note as HTMLTextAreaElement).value).toBe(""));
    fireEvent.change(note, { target: { value: "rest day" } });
    fireEvent.blur(note);
    await waitFor(() => expect(store.get_body_day("2026-11-10").comment).toBe("rest day"));
  });
});

describe("body reports", () => {
  it("shows the figures, the trend chart with its goal and the history", async () => {
    const store = fake_page();
    store.save_body_metric({ id: "weight", name: "Weight", kind: "weight", goal: 75 });
    store.set_body_reading("weight", "2026-11-01", 83);
    store.set_body_reading("weight", "2026-11-10", 81.5);
    store.set_body_note("2026-11-10", "morning");
    show(["reports"]);

    const latest = await screen.findByText("Latest");
    expect(latest.parentElement?.textContent).toContain("81.5 kg");
    expect(screen.getByText("Change").parentElement?.textContent).toContain("-1.5 kg");
    expect(screen.getByText("To Go").parentElement?.textContent).toContain("-6.5 kg");
    const chart = screen.getByRole("img", { name: "Weight (kg)" });
    expect(chart.querySelectorAll("circle")).toHaveLength(2);
    expect(within(chart).getByText("Goal: 75 kg")).toBeTruthy();
    expect(await screen.findByText("morning")).toBeTruthy();
  });

  it("says so when the chosen metric has no readings in range", async () => {
    fake_page();
    show(["reports"]);
    fireEvent.change(await screen.findByLabelText("Metric"), { target: { value: "waist" } });
    expect(await screen.findByText("No Waist readings in this range.")).toBeTruthy();
  });

  it("cards every metric read in range, reports on one when picked, and compares their change in percent", async () => {
    const store = fake_page();
    store.set_body_reading("weight", "2026-11-01", 80);
    store.set_body_reading("weight", "2026-11-10", 76);
    store.set_body_reading("waist", "2026-11-01", 90);
    store.set_body_reading("waist", "2026-11-10", 99);
    show(["reports"]);

    const waist_card = await screen.findByRole("button", { name: /^Waist.*99 cm/ });
    expect(waist_card.textContent).toContain("99 cm");
    expect(waist_card.textContent).toContain("+9 cm");
    fireEvent.click(waist_card);
    expect(await screen.findByRole("img", { name: "Waist (cm)" })).toBeTruthy();

    const compare = screen.getByRole("img", { name: "Change since the start of the range (%)" });
    expect(compare.querySelectorAll("path")).toHaveLength(2);
    expect([...compare.querySelectorAll("path > title")].map((title) => title.textContent)).toEqual(["Weight", "Waist"]);
  });
});

describe("body metrics", () => {
  it("adds a metric with a custom unit and goal", async () => {
    const store = fake_page();
    show(["metrics"]);

    fireEvent.click(await screen.findByRole("button", { name: "Add metric" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Blood Pressure" } });
    fireEvent.change(within(dialog).getByLabelText("Measured in"), { target: { value: "custom" } });
    fireEvent.change(within(dialog).getByLabelText("Unit"), { target: { value: "mmHg" } });
    const goal = within(dialog).getByRole("textbox", { name: "Goal" });
    fireEvent.change(goal, { target: { value: "120" } });
    fireEvent.blur(goal);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.list_body_metrics().at(-1)).toMatchObject({ name: "Blood Pressure", kind: "custom", unit: "mmHg", goal: 120 }));
    expect(await screen.findByText("Custom Unit (mmHg)")).toBeTruthy();
  });

  it("moves a metric and deletes one with its readings after saying how many", async () => {
    const store = fake_page();
    store.set_body_reading("neck", "2026-11-01", 38);
    show(["metrics"]);

    fireEvent.click((await screen.findAllByRole("button", { name: "Move up" }))[1]!);
    await waitFor(() => expect(store.list_body_metrics()[0]?.id).toBe("bodyfat"));

    fireEvent.click(screen.getByRole("button", { name: "Delete Neck" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Its 1 reading is deleted with it.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(store.list_body_metrics().some((metric) => metric.id === "neck")).toBe(false));
  });
});

describe("you on the metrics page", () => {
  it("edits the sex and the birth date above the metrics, and Settings has no Body section", async () => {
    const store = fake_page();
    show(["metrics"]);

    fireEvent.change(await screen.findByRole("combobox", { name: "Sex" }), { target: { value: "female" } });
    await waitFor(() => expect(store.get_settings()["body.sex"]).toBe("female"));
    const birth_date = screen.getByLabelText("Birth date");
    fireEvent.change(birth_date, { target: { value: "1990-05-31" } });
    fireEvent.blur(birth_date);
    await waitFor(() => expect(store.get_settings()["body.birth_date"]).toBe("1990-05-31"));
    expect(await screen.findByText("36 years old")).toBeTruthy();

    cleanup();
    render(<SettingsView />);
    expect(await screen.findByRole("combobox", { name: "BMR formula" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Height" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Sex" })).toBeNull();
  });
});
