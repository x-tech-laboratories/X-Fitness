// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { BodyView } from "../src/web/body/index.tsx";

// The canvas needs WebGL, so each viewer stands in as a box naming its label and every body's colour and opacity.
vi.mock("../src/web/body/BodyViewer.tsx", () => ({
  create_view_link: () => ({ listeners: new Set() }),
  load_body_model: async () => ({}),
  BodyViewer: ({ label, looks }: { label: string; looks: { color: string; opacity: number }[] }) => (
    <div data-testid="viewer" aria-label={label}>{looks.map((look) => `${look.color}@${look.opacity}`).join(" ")}</div>
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
});
