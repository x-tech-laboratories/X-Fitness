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

// jsdom draws no canvas, so a shrunk picture names the side it was shrunk to.
vi.mock("@x-tech-laboratories/x-libs/web/pictures", () => ({
  shrink_picture: async (_file: Blob, { largest_side }: { largest_side: number }) => `data:image/webp;base64,${btoa(`side${largest_side}`)}`,
}));

const picture = (name: string) => `data:image/webp;base64,${btoa(name)}`;

function open_device() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return bind_methods(() => database, () => undefined);
}

// The page's calls answered by a real store on a throwaway database, as a host would.
function fake_page(): FitnessMethods {
  const methods = open_device();
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

// ── Store ────────────────────────────────────────────────────────────────────

describe("progress photo store", () => {
  it("adds, lists newest first with thumbnails, gives the whole picture, changes and deletes photos", () => {
    const store = open_device();
    const front = store.save_body_photo({ date: "2026-10-01", pose: "front", picture: picture("front"), thumbnail: picture("front small") });
    const side = store.save_body_photo({ date: "2026-11-01", pose: "side", comment: " Morning ", picture: picture("side") });

    expect(store.list_body_photos()).toEqual([
      { id: side, date: "2026-11-01", pose: "side", comment: "Morning", thumbnail: picture("side") },
      { id: front, date: "2026-10-01", pose: "front", comment: "", thumbnail: picture("front small") },
    ]);
    expect(store.get_body_photo(front).picture).toBe(picture("front"));

    store.save_body_photo({ id: front, date: "2026-10-02", pose: "back" });
    expect(store.get_body_photo(front)).toMatchObject({ date: "2026-10-02", pose: "back", picture: picture("front"), thumbnail: picture("front small") });

    // A new picture without a thumbnail is shown whole rather than beside the old small one.
    store.save_body_photo({ id: front, date: "2026-10-02", picture: picture("again") });
    expect(store.get_body_photo(front).thumbnail).toBe(picture("again"));

    store.delete_body_photo(side);
    expect(store.list_body_photos().map((photo) => photo.id)).toEqual([front]);
  });

  it("lists a day's photos front, side, back and then any other", () => {
    const store = open_device();
    for (const pose of ["", "back", "side", "front"]) store.save_body_photo({ date: "2026-11-01", pose, picture: picture(`pose ${pose}`) });
    expect(store.list_body_photos().map((photo) => photo.pose)).toEqual(["front", "side", "back", ""]);
  });

  it("refuses a new photo without a picture, a picture that is no image and a bad day", () => {
    const store = open_device();
    expect(() => store.save_body_photo({ date: "2026-11-01" })).toThrow("needs a picture");
    expect(() => store.save_body_photo({ date: "2026-11-01", picture: "https://example.com/me.jpg" })).toThrow("data URL");
    expect(() => store.save_body_photo({ date: "yesterday", picture: picture("x") })).toThrow("Not a day");
    expect(store.list_body_photos()).toEqual([]);
  });

  it("keeps a deleted photo in its history to bring back", () => {
    const store = open_device();
    const id = store.save_body_photo({ date: "2026-11-01", pose: "front", picture: picture("front") });
    store.delete_body_photo(id);
    const [deleted] = store.list_item_history("body_photo", id);
    store.restore_item_version("body_photo", deleted!.id);
    expect(store.get_body_photo(id).picture).toBe(picture("front"));
  });
});

// ── Page ─────────────────────────────────────────────────────────────────────

describe("progress photos page", () => {
  it("adds a photo from a file in the first pose not yet taken today", async () => {
    const store = fake_page();
    store.save_body_photo({ date: "2026-11-10", pose: "front", picture: picture("front") });
    const { container } = show(["photos"]);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Photos");
    await screen.findByRole("list", { name: "Photos on 2026-11-10" });
    const file = new File(["x"], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog", { name: "Add photo" });
    expect((within(dialog).getByRole("combobox", { name: "Pose" }) as HTMLSelectElement).value).toBe("side");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Note" }), { target: { value: "After the cut" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.list_body_photos()).toHaveLength(2));
    const added = store.list_body_photos().find((photo) => photo.pose === "side")!;
    expect(added).toMatchObject({ date: "2026-11-10", comment: "After the cut", thumbnail: picture("side400") });
    expect(store.get_body_photo(added.id).picture).toBe(picture("side2000"));
  });

  it("compares the first and latest day pose by pose", async () => {
    const store = fake_page();
    store.save_body_photo({ date: "2026-09-01", pose: "front", picture: picture("old front") });
    store.save_body_photo({ date: "2026-10-01", pose: "front", picture: picture("mid front") });
    store.save_body_photo({ date: "2026-11-01", pose: "front", picture: picture("new front") });
    store.save_body_photo({ date: "2026-11-01", pose: "back", picture: picture("new back") });
    show(["photos"]);

    fireEvent.click(await screen.findByRole("radio", { name: "Compare" }));
    const front = await screen.findByRole("region", { name: "Front" });
    await waitFor(() => expect([...front.querySelectorAll("img")].map((image) => image.getAttribute("src"))).toEqual([picture("old front"), picture("new front")]));
    expect(within(screen.getByRole("region", { name: "Back" })).getByText("No photo in this pose.")).toBeTruthy();
  });
});
