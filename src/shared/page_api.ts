// What the page knows of its host without loading the store: the names the calls travel under, and the api's shape.
// The browser build imports only this, so the stores and Drizzle stay out of the page a server serves.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { backup_method_names, type BackupClient, type BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import type { CertificateClient } from "@x-tech-laboratories/x-libs/certificate_protocol";
import type { LocalMcpClient } from "@x-tech-laboratories/x-libs/local_mcp_protocol";
import { sync_device_method_names, type SyncDeviceMethods, type SyncStatus } from "@x-tech-laboratories/x-libs/sync_protocol";

import type { FitnessMethods } from "./store.ts";

// ── Names ────────────────────────────────────────────────────────────────────

export const fitness_api_name = "x_fitness";
export const device_api_name = "x_fitness_device";
export const events_api_name = "x_fitness_events";
export const certificates_api_name = "x_fitness_certificates";
export const local_mcp_api_name = "x_fitness_local_mcp";

// ── Device calls ─────────────────────────────────────────────────────────────

// Sync with a server and backups of the device's own database; a browser is already on the server.
export type DeviceMethods = SyncDeviceMethods & BackupMethods;

export const device_method_names = [...sync_device_method_names, ...backup_method_names] as const;

// What the main process tells the page on its own: the data changed elsewhere, or sync's status moved.
export type FitnessEvents = { changed: null; sync_status: SyncStatus };

// ── The page's api ───────────────────────────────────────────────────────────

export type Host = "web" | "desktop" | "android";

export interface PageApi {
  host: Host;
  calls: Client<FitnessMethods>;
  // Null in a browser, which syncs nothing itself.
  device: Client<DeviceMethods> | null;
  // The backups of whichever database the page works on: the device's own, or the server's for a browser; left out where
  // none are offered, and Settings then shows no Backups section.
  backups?: BackupClient;
  // Where a phone keeps its backups: a folder the user picks once, with no backups until then.
  backup_folder?: { get: () => Promise<string>; choose: () => Promise<string> };
  // Set where the app makes its own connections and can trust a certificate the system refuses.
  certificates?: CertificateClient;
  // Set on the desktop, which can serve its own MCP endpoint to AI clients on the same computer.
  local_mcp?: LocalMcpClient;
  // Runs whenever the data changed somewhere else; returns the function that stops listening.
  on_change: (listener: () => void) => () => void;
}

// ── Calls ────────────────────────────────────────────────────────────────────

// A call that only reads; any other call announces a change.
export function is_read_only(method: string): boolean {
  return /^(list|get|search|lookup|export)_/.test(method);
}
