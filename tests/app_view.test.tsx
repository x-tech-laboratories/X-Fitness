// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { App } from "../src/web/App.tsx";

// The page's calls answered by a real store on a throwaway database, as the desktop app would, which needs no sign-in.
function fake_page(): FitnessMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "desktop", calls: calls as unknown as Client<FitnessMethods>, device: null, on_change: () => () => undefined });
  return methods;
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
  window.localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("sidebar", () => {
  it("lists each feature's pages under it and opens one when picked", async () => {
    fake_page();
    render(<App />);

    const tree = screen.getByRole("tree", { name: "Sections" });
    expect(within(tree).getAllByRole("treeitem").map((row) => row.getAttribute("aria-level"))).toContain("2");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(tree).getByText("Reports", { selector: "[data-id='body/reports'] *" }));
    expect(window.location.hash).toBe("#/body/reports");
    go("#/body/reports");
    expect(await screen.findByRole("heading", { level: 1, name: /Reports/ })).toBeTruthy();
    expect(tree.querySelector("[data-id='body/reports']")?.getAttribute("aria-selected")).toBe("true");
  });

  it("folds a feature shut, lighting it up in place of its hidden page", () => {
    fake_page();
    render(<App />);
    go("#/workouts/log");

    fireEvent.click(screen.getByRole("button", { name: "Collapse Workouts" }));
    const tree = screen.getByRole("tree", { name: "Sections" });
    expect(tree.querySelector("[data-id='workouts/log']")).toBeNull();
    expect(tree.querySelector("[data-id='workouts']")?.getAttribute("aria-selected")).toBe("true");
  });
});

describe("overview", () => {
  it("shows today's eating, the week's training and each metric read lately", async () => {
    const store = fake_page();
    store.set_body_reading("weight", "2026-11-01", 82);
    store.set_body_reading("weight", "2026-11-10", 80.5);
    render(<App />);

    expect(await screen.findByText("Workouts this week")).toBeTruthy();
    expect(await screen.findByText("No workouts yet.")).toBeTruthy();
    expect(screen.getByText("Nothing logged today.")).toBeTruthy();
    expect(await screen.findByText("80.5 kg")).toBeTruthy();
    expect(screen.getByText(/-1\.5 kg in 90 days/)).toBeTruthy();
  });
});
