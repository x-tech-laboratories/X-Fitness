// The desktop's connections as its main process holds them: signing in to a daemon on another host as this device, its
// calls and change events through the link, and moving back to this computer's daemon on its socket.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SavedConnections } from "@x-tech-laboratories/x-libs/connection_protocol";
import { create_connections } from "@x-tech-laboratories/x-libs/connections";
import { create_daemon_link } from "@x-tech-laboratories/x-libs/daemon_link";
import { listen_on_socket } from "@x-tech-laboratories/x-libs/local_daemon";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";

import { build_app, type AppOptions } from "../src/server/app.ts";
import { open_store } from "../src/shared/store.ts";

const password = "a long enough password";
const off = { state: "off", server_url: "", user: "", last_synced_at: "", pending_changes: 0, error: "" } as const;

const opened: FastifyInstance[] = [];
const folders: string[] = [];

afterEach(async () => {
  for (const app of opened.splice(0)) await app.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// One daemon on a throwaway database with every handler, on the network behind the sign-in or on a socket without.
async function daemon(declared: AppOptions["declared"]): Promise<FastifyInstance> {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const backups = { list_backups: vi.fn(async () => []), create_backup: vi.fn(), restore_backup: vi.fn(), remove_backup: vi.fn(), get_backup_schedule: vi.fn(() => ({ automatic: true, to_keep: 14 })), set_backup_schedule: vi.fn() };
  const app = await build_app({
    database: () => database,
    changes: new EventStream(),
    declared,
    backups,
    device: { ...backups, get_sync_status: () => off, connect_sync: async () => off, disconnect_sync: () => off, sync_now: async () => off },
    certificates: { check_certificate: async () => null, trust_certificate: async () => [], list_trusted_certificates: () => [], forget_certificate: () => [] },
    local_mcp: { get_local_mcp_settings: () => ({ enabled: false, port: 3918 }), set_local_mcp_settings: async () => undefined, get_local_mcp_status: async () => ({ state: "off", url: "", error: "" }) },
  });
  opened.push(app);
  return app;
}

function memory_storage() {
  let saved: SavedConnections | null = null;
  return { read: () => saved, write: (next: SavedConnections) => void (saved = next) };
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("the desktop's connections", () => {
  it("signs in to a daemon on another host and sends it the page's calls with this device's token", async () => {
    const remote = await daemon(new Map([["ada", hash_password(password)]]));
    await remote.listen({ host: "127.0.0.1", port: 0 });
    const { port } = remote.server.address() as { port: number };
    const folder = mkdtempSync(join(tmpdir(), "x-fitness-connections-"));
    folders.push(folder);
    const connections = create_connections({ storage: memory_storage(), offers_local: true, device_name: "X-Fitness on tests" });
    const link = create_daemon_link({ connections, socket_path: join(folder, "none.sock") });

    const added = await connections.methods.add_connection(`http://127.0.0.1:${port}`, { name: "ada", password });
    const home = added.connections.find((connection) => connection.kind === "remote")!;
    expect(added.current).toBe("local");
    await connections.methods.choose_connection(home.id);

    await link.call("/api/call/set_setting", ["mass_unit", "lb"]);
    expect(await link.call("/api/call/get_settings")).toMatchObject({ mass_unit: "lb" });
    // The device's own token is an admin's here, so the daemon's own sync and backups are reached too.
    expect(await link.call("/api/device/get_sync_status")).toEqual(off);

    const heard: string[] = [];
    const stop = link.follow_events("/api/events", (event) => heard.push(event));
    try {
      await until(() => heard.includes("hello"), "the remote daemon's hello");
      await remote.inject({ method: "POST", url: "/api/call/set_setting", payload: ["mass_unit", "kg"], headers: { authorization: `Bearer ${(connections.current() as { token: string }).token}` } });
      await until(() => heard.includes("changed"), "the remote daemon's change");
    } finally {
      stop();
    }
  });

  it("refuses a wrong password in the daemon's own words", async () => {
    const remote = await daemon(new Map([["ada", hash_password(password)]]));
    await remote.listen({ host: "127.0.0.1", port: 0 });
    const { port } = remote.server.address() as { port: number };
    const connections = create_connections({ storage: memory_storage(), offers_local: true, device_name: "X-Fitness on tests" });

    await expect(connections.methods.add_connection(`http://127.0.0.1:${port}`, { name: "ada", password: "wrong" })).rejects.toThrow("Wrong name or password.");
  });

  it("reaches this computer's daemon over its socket with no sign-in", async () => {
    const folder = mkdtempSync(join(tmpdir(), "x-fitness-connections-"));
    folders.push(folder);
    const socket_path = join(folder, "x-fitness", "daemon.sock");
    const local = await daemon(null);
    await listen_on_socket(socket_path, (path) => local.listen({ path }));
    const connections = create_connections({ storage: memory_storage(), offers_local: true, device_name: "X-Fitness on tests" });
    const link = create_daemon_link({ connections, socket_path });

    await link.call("/api/call/set_setting", ["energy_unit", "kJ"]);

    expect(await link.call("/api/call/get_settings")).toMatchObject({ energy_unit: "kJ" });
  });
});
