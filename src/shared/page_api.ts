// What the page knows of its host without loading the store: the names the calls travel under, and the api's shape.
// The browser build imports only this, so the stores and Drizzle stay out of the page a server serves.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import type { SyncCredentials, SyncDirection, SyncStatus } from "@x-tech-laboratories/x-libs/sync_protocol";

import type { FitnessMethods } from "./store.ts";

// ── Names ────────────────────────────────────────────────────────────────────

export const fitness_api_name = "x_fitness";
export const device_api_name = "x_fitness_device";
export const events_api_name = "x_fitness_events";

// ── Device calls ─────────────────────────────────────────────────────────────

// Sync with a server, which only a device with its own database does; a browser is already on the server.
export interface DeviceMethods {
  get_sync_status: () => SyncStatus;
  // Signs this device in with a name and password, or keeps its sign-in when given null.
  connect_sync: (server_url: string, credentials: SyncCredentials | null, direction: SyncDirection) => Promise<SyncStatus>;
  disconnect_sync: () => SyncStatus;
  sync_now: () => Promise<SyncStatus>;
}

export const device_method_names = ["get_sync_status", "connect_sync", "disconnect_sync", "sync_now"] as const satisfies readonly (keyof DeviceMethods)[];

// What the main process tells the page on its own: the data changed elsewhere, or sync's status moved.
export type FitnessEvents = { changed: null; sync_status: SyncStatus };

// ── The page's api ───────────────────────────────────────────────────────────

export type Host = "web" | "desktop" | "android";

export interface PageApi {
  host: Host;
  calls: Client<FitnessMethods>;
  // Null in a browser, which syncs nothing itself.
  device: Client<DeviceMethods> | null;
  // Runs whenever the data changed somewhere else; returns the function that stops listening.
  on_change: (listener: () => void) => () => void;
}

// ── Calls ────────────────────────────────────────────────────────────────────

// A call that only reads; any other call announces a change.
export function is_read_only(method: string): boolean {
  return /^(list|get|search|lookup|export)_/.test(method);
}
