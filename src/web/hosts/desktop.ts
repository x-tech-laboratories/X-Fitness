// The desktop app's page: the preload has put the main process's calls on the window.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import type { EventsClient } from "@x-tech-laboratories/x-libs/electron/events";

import { device_api_name, events_api_name, fitness_api_name, type DeviceMethods, type FitnessEvents, type PageApi } from "../../shared/page_api.ts";
import type { FitnessMethods } from "../../shared/store.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

type DesktopWindow = Record<string, unknown>;

export function is_desktop(): boolean {
  return fitness_api_name in window;
}

export function desktop_api(): PageApi {
  const desktop = window as unknown as DesktopWindow;
  const events = desktop[events_api_name] as EventsClient<FitnessEvents>;
  return {
    host: "desktop",
    calls: desktop[fitness_api_name] as Client<FitnessMethods>,
    device: desktop[device_api_name] as Client<DeviceMethods>,
    on_change: (listener) => events.on("changed", listener),
  };
}
