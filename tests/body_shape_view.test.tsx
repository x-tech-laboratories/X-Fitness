// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { BodyView } from "../src/web/body/index.tsx";
import { today } from "../src/web/body/LogTab.tsx";

// The canvas needs WebGL, so each viewer stands in as a box naming its label, every body's colour and opacity, and whether it is shaded.
vi.mock("../src/web/body/BodyViewer.tsx", () => ({
  create_view_link: () => ({ listeners: new Set() }),
  load_body_model: async () => ({}),
  BodyViewer: ({ label, looks, change_from }: { label: string; looks: { color: string; opacity: number }[]; change_from?: object | null }) => (
    <div data-testid="viewer" aria-label={label}>{looks.map((look) => `${look.color}@${look.opacity}`).join(" ") + (change_from ? " shaded" : "")}</div>
  ),
}));

class FitWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(request: { id: number }): void {
    queueMicrotask(() => this.onmessage?.({ data: { id: request.id, fit: { parameters: { sex: 1, muscle: 0.5, weight: 0.5, height: 0.5, girths: {} }, lines: [] }, error: "" } } as MessageEvent));
  }
  terminate(): void {}
}

function fake_page(): FitnessMethods {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  const calls = Object.fromEntries(Object.entries(methods).map(([name, call]) => [name, async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args)]));
  set_page_api({ host: "web", calls: calls as unknown as Client<FitnessMethods>, device: null, on_change: () => () => undefined });
  return methods;
}

beforeEach(() => {
  vi.stubGlobal("Worker", FitWorker);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the 3D tab", () => {
  it("shows the body now and at the goals side by side to begin with, solid in their colours", async () => {
    fake_page();
    render(<BodyView parts={["shape"]} />);

    const viewers = await screen.findAllByTestId("viewer");
    expect(viewers.map((viewer) => viewer.getAttribute("aria-label"))).toEqual([expect.stringContaining("now"), expect.stringContaining("at your goals")]);
    expect(viewers.map((viewer) => viewer.textContent)).toEqual(["#2563eb@1", "#f59e0b@1"]);
    expect(screen.queryByRole("slider", { name: "Now opacity" })).toBeNull();
  });

  it("overlays the two bodies and lets each layer's colour and opacity be set", async () => {
    fake_page();
    render(<BodyView parts={["shape"]} />);
    await screen.findAllByTestId("viewer");

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Show" })).getByRole("radio", { name: "Overlay" }));
    expect((await screen.findAllByTestId("viewer")).map((viewer) => viewer.textContent)).toEqual(["#2563eb@0.6 #f59e0b@0.6"]);

    fireEvent.change(screen.getByRole("slider", { name: "Goal opacity" }), { target: { value: "30" } });
    expect(screen.getByTestId("viewer").textContent).toBe("#2563eb@0.6 #f59e0b@0.3");
    expect(screen.getByRole("slider", { name: "Now opacity" })).toBeTruthy();
  });

  it("shows one body alone when asked", async () => {
    fake_page();
    render(<BodyView parts={["shape"]} />);
    await screen.findAllByTestId("viewer");

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Show" })).getByRole("radio", { name: "Goal" }));
    const viewers = await screen.findAllByTestId("viewer");
    expect(viewers).toHaveLength(1);
    expect(viewers[0]!.getAttribute("aria-label")).toContain("at your goals");
  });

  it("keeps each layer's colour and opacity in the settings, and draws with what is saved", async () => {
    const methods = fake_page();
    render(<BodyView parts={["shape"]} />);
    await screen.findAllByTestId("viewer");

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Show" })).getByRole("radio", { name: "Overlay" }));
    fireEvent.change(await screen.findByRole("slider", { name: "Goal opacity" }), { target: { value: "30" } });
    await waitFor(() => expect(methods.get_settings()["body.shape_looks"]).toMatchObject({ goal: { color: "#f59e0b", opacity: 0.3 } }));

    cleanup();
    methods.set_setting("body.shape_looks", { now: { color: "#dc2626", opacity: 0.5 } });
    render(<BodyView parts={["shape"]} />);
    const viewers = await screen.findAllByTestId("viewer");
    expect(viewers.map((viewer) => viewer.textContent)).toEqual(["#dc2626@1", "#f59e0b@1"]);
  });

  it("puts the body on another day beside the one shown, in its own colour", async () => {
    const methods = fake_page();
    const weight = methods.list_body_metrics().find((metric) => metric.kind === "weight")!;
    methods.set_body_reading(weight.id, "2020-01-01", 90);
    methods.set_body_reading(weight.id, today(), 85);
    render(<BodyView parts={["shape"]} />);
    await screen.findAllByTestId("viewer");

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Compare with" })).getByRole("radio", { name: "Another day" }));
    await waitFor(() => expect(screen.getAllByTestId("viewer")[1]!.getAttribute("aria-label")).toBe("Your body on 2020-01-01"));
    expect(screen.getAllByTestId("viewer").map((viewer) => viewer.textContent)).toEqual(["#2563eb@1", "#16a34a@1"]);
    expect(screen.getByRole("slider", { name: "Compared day" })).toBeTruthy();

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Show" })).getByRole("radio", { name: "Overlay" }));
    expect((await screen.findAllByTestId("viewer")).map((viewer) => viewer.textContent)).toEqual(["#2563eb@0.6 #16a34a@0.6"]);
    expect(screen.getByRole("slider", { name: "2020-01-01 opacity" })).toBeTruthy();
  });

  it("shades the body now by where it differs from the body beside it", async () => {
    fake_page();
    render(<BodyView parts={["shape"]} />);
    await screen.findAllByTestId("viewer");

    fireEvent.click(screen.getByRole("switch", { name: "Shade the change" }));
    await waitFor(() => expect(screen.getAllByTestId("viewer").map((viewer) => viewer.textContent)).toEqual(["#2563eb@1 shaded", "#f59e0b@1"]));
    expect(screen.getByText(/larger than at the goals/)).toBeTruthy();

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Show" })).getByRole("radio", { name: "Overlay" }));
    expect((await screen.findAllByTestId("viewer")).map((viewer) => viewer.textContent)).toEqual(["#2563eb@0.6 #f59e0b@0.6"]);
  });

  it("plays through the days from the first, keeping the view, and stops on the last", async () => {
    const methods = fake_page();
    const weight = methods.list_body_metrics().find((metric) => metric.kind === "weight")!;
    for (const [date, value] of [["2020-01-01", 90], ["2020-02-01", 88], [today(), 85]] as const) methods.set_body_reading(weight.id, date, value);
    render(<BodyView parts={["shape"]} />);
    await screen.findAllByTestId("viewer");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Show" })).getByRole("radio", { name: "Now" }));

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(screen.getByTestId("viewer").getAttribute("aria-label")).toBe("Your body now on 2020-01-01"));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("viewer").getAttribute("aria-label")).toBe("Your body now on 2020-02-01"), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByTestId("viewer").getAttribute("aria-label")).toBe(`Your body now on ${today()}`);
    expect(screen.getAllByTestId("viewer")).toHaveLength(1);
  });
});
