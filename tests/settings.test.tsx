// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";

import type { DeviceMethods } from "../src/shared/page_api.ts";
import { setting_defaults, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";

afterEach(cleanup);

function fake_calls(saved: Record<string, unknown>): Client<FitnessMethods> {
  return {
    get_settings: vi.fn(async () => ({ ...setting_defaults, ...saved })),
    set_setting: vi.fn(async (key: string, value: unknown) => {
      saved[key] = value;
    }),
  } as unknown as Client<FitnessMethods>;
}

const off = { state: "off", server_url: "", user: "", last_synced_at: "", pending_changes: 0, error: "" } as const;

describe("settings", () => {
  it("shows the units with their defaults and saves a change", async () => {
    const calls = fake_calls({ length_unit: "in" });
    set_page_api({ host: "web", calls, device: null, on_change: () => () => undefined });
    render(<SettingsView />);

    const weight = await screen.findByRole("radiogroup", { name: "Weight" });
    expect(weight.querySelector("[aria-checked=true]")?.textContent).toBe("kg");
    expect(screen.getByRole("radiogroup", { name: "Length" }).querySelector("[aria-checked=true]")?.textContent).toBe("in");

    fireEvent.click(screen.getByRole("radio", { name: "lb" }));
    await waitFor(() => expect(calls.set_setting).toHaveBeenCalledWith("mass_unit", "lb"));
    expect(screen.queryByText("Sync")).toBeNull();
  });

  it("offers sync on a device and signs it in with the choice of copy", async () => {
    const device = {
      get_sync_status: vi.fn(async () => off),
      connect_sync: vi.fn(async () => ({ ...off, state: "idle", server_url: "https://fitness.example.org/" })),
      disconnect_sync: vi.fn(),
      sync_now: vi.fn(),
    } as unknown as Client<DeviceMethods>;
    set_page_api({ host: "desktop", calls: fake_calls({}), device, on_change: () => () => undefined });
    render(<><SettingsView /><Dialogs /></>);

    fireEvent.change(await screen.findByLabelText("Server address"), { target: { value: "https://fitness.example.org" } });
    fireEvent.change(screen.getByLabelText("User name"), { target: { value: "ada" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Use the server's fitness data" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the server's" }));
    await waitFor(() => expect(device.connect_sync).toHaveBeenCalledWith("https://fitness.example.org", { name: "ada", password: "secret" }, "download"));
  });

  it("shows the server's backups in a browser and takes one by hand", async () => {
    const taken = { name: "fitness-2026-11-10T09-30-00Z.db", taken_at: "2026-11-10T09:30:00Z", is_automatic: false, size_bytes: 4096 };
    const backups = {
      list_backups: vi.fn(async () => [taken]),
      create_backup: vi.fn(async () => taken),
      restore_backup: vi.fn(),
      remove_backup: vi.fn(),
      get_backup_schedule: vi.fn(async () => ({ automatic: true, to_keep: 14 })),
      set_backup_schedule: vi.fn(),
    };
    set_page_api({ host: "web", calls: fake_calls({}), device: null, backups, on_change: () => () => undefined });
    render(<><SettingsView /><Dialogs /></>);

    expect((await screen.findAllByText("Server")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Backups")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Sync")).toBeNull();
    await waitFor(() => expect(backups.list_backups).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Back up" }));
    await waitFor(() => expect(backups.create_backup).toHaveBeenCalled());
  });

  it("waits for a phone to pick its backup folder, then reads the backups in it", async () => {
    const backups = {
      list_backups: vi.fn(async () => []),
      create_backup: vi.fn(),
      restore_backup: vi.fn(),
      remove_backup: vi.fn(),
      get_backup_schedule: vi.fn(async () => ({ automatic: true, to_keep: 14 })),
      set_backup_schedule: vi.fn(),
    };
    const backup_folder = { get: vi.fn(async () => ""), choose: vi.fn(async () => "Documents") };
    const device = { get_sync_status: vi.fn(async () => off) } as unknown as Client<DeviceMethods>;
    set_page_api({ host: "android", calls: fake_calls({}), device, backups, backup_folder, on_change: () => () => undefined });
    render(<><SettingsView /><Dialogs /></>);

    expect(await screen.findByRole("button", { name: "Back up" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back up" })).toHaveProperty("disabled", false);
    await waitFor(() => expect(backups.list_backups).toHaveBeenCalledTimes(2));
  });
});
