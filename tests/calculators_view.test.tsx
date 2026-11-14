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

function show(parts: string[]) {
  return render(<><CalculatorsView parts={parts} /><Dialogs /></>);
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
    show([]);

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
    show(["calculate"]);

    fireEvent.click(await screen.findByRole("button", { name: "Log as today's Body Fat" }));
    await waitFor(() => expect(store.get_body_day("2026-11-13").rows.find((row) => row.metric.id === "bodyfat")?.value).toBe(18.4));
  });

  it("sets the goals from the plan and keeps the diet's targets following it", async () => {
    const store = fake_page();
    show(["goals"]);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Goals");
    fireEvent.click(await screen.findByRole("button", { name: "Use the plan's weight" }));
    await waitFor(() => expect(store.list_body_metrics().find((metric) => metric.id === "weight")?.goal).toBeCloseTo(71.3));
    fireEvent.click(screen.getByRole("switch", { name: "Diet targets follow the plan" }));
    await waitFor(() => expect(store.get_settings()["calculators.follow_diet_targets"]).toBe(true));
    expect(store.get_settings()["diet.target_protein"]).toBe(128);
  });
});
