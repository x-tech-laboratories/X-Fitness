// A browser's page: every call goes to the web server it was loaded from, and the server's event stream says when
// another page or device changed something.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { BackupClient } from "@x-tech-laboratories/x-libs/backup_protocol";
import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { LoginNeeded } from "@x-tech-laboratories/x-libs/web/states";

import type { PageApi } from "../../shared/page_api.ts";
import type { FitnessMethods } from "../../shared/store.ts";

// ── Server calls ─────────────────────────────────────────────────────────────

// Relative, so a server behind a proxy under a folder keeps it.
const call_path = "api/call/";
const backup_path = "api/backup/";
const events_path = "api/events";
const client_id_header = "x-client-id";

// Given by the server when the page connects, so the page is not told about its own changes.
let client_id = "";

// A signed-out page shows the sign-in form rather than stale data.
async function call_server(method: string, args: unknown[], path = call_path): Promise<unknown> {
  const response = await fetch(path + method, {
    method: "POST",
    headers: { "content-type": "application/json", [client_id_header]: client_id },
    body: JSON.stringify(args),
  });
  if (response.status === 401) throw new LoginNeeded("Sign in first.");
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text === "" ? undefined : JSON.parse(text);
}

// ── Change events ────────────────────────────────────────────────────────────

const reconnect_delay_ms = 5000;

// A greeting after the first means the stream reconnected and may have missed changes, so the page reloads too.
function follow_changes(on_change: () => void): void {
  let has_connected = false;
  const connect = (): void => {
    const events = new EventSource(events_path);
    events.addEventListener("hello", (event) => {
      client_id = (event as MessageEvent<string>).data;
      if (has_connected) on_change();
      has_connected = true;
    });
    events.addEventListener("changed", on_change);
    // The browser retries a dropped stream by itself but gives up on a refused one, so the page tries again later.
    events.addEventListener("error", () => {
      if (events.readyState === EventSource.CLOSED) setTimeout(connect, reconnect_delay_ms);
    });
  };
  connect();
}

// ── Api ──────────────────────────────────────────────────────────────────────

// Any call by name goes to the server, which refuses names it does not know, so the page needs no list of them.
function server_calls(): Client<FitnessMethods> {
  return new Proxy({} as Client<FitnessMethods>, {
    get: (_target, name) => (typeof name === "string" ? (...args: unknown[]) => call_server(name, args) : undefined),
  });
}

// The server's own backups, which only an admin may take, restore or delete.
function server_backups(): BackupClient {
  return new Proxy({} as BackupClient, {
    get: (_target, name) => (typeof name === "string" ? (...args: unknown[]) => call_server(name, args, backup_path) : undefined),
  });
}

export function web_api(): PageApi {
  const listeners = new Set<() => void>();
  follow_changes(() => {
    for (const listener of listeners) listener();
  });
  return {
    host: "web",
    calls: server_calls(),
    backups: server_backups(),
    device: null,
    on_change: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
