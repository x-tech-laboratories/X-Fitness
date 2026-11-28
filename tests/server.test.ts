import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";

import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";
import { create_sync_peer } from "@x-tech-laboratories/x-libs/sync_peer";
import type { PeerIdentity, PeerRecord, PeerStorage } from "@x-tech-laboratories/x-libs/sync_protocol";

import { build_app } from "../src/server/app.ts";
import { bind_methods, method_names, open_store, sync_engine } from "../src/shared/store.ts";

let app: FastifyInstance;
// The token every request but the sign-in tests carries.
let token = "";
const password = "a long enough password";

afterEach(async () => {
  await app?.close();
});

// Sends one MCP request as a client speaking the 2025 protocol would, and gives back its result.
async function mcp(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
  const reply = await signed({
    method: "POST",
    url: "/api/mcp",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = /^data: (.+)$/m.exec(reply.body)?.[1] ?? reply.body;
  return (JSON.parse(data) as { result: Record<string, unknown> }).result;
}

const taken = { name: "fitness-2026-11-10T09-30-00Z.db", taken_at: "2026-11-10T09:30:00Z", is_automatic: false, size_bytes: 4096 };
const fake_backups = {
  list_backups: vi.fn(async () => [taken]),
  create_backup: vi.fn(async () => taken),
  restore_backup: vi.fn(async () => undefined),
  remove_backup: vi.fn(async () => undefined),
  get_backup_schedule: vi.fn(() => ({ automatic: true, to_keep: 14 })),
  set_backup_schedule: vi.fn(),
};

// A device's keys and paired devices, kept in memory for a test.
function memory_peer_storage(): PeerStorage {
  let identity: PeerIdentity | null = null;
  let peers: PeerRecord[] = [];
  return {
    read_identity: () => identity,
    write_identity: (written) => void (identity = written),
    read_peers: () => peers,
    write_peers: (written) => void (peers = written),
    back_up_before_replace: () => undefined,
  };
}

let server_database: DatabaseSync;

async function start(web_folder = "/nonexistent"): Promise<FastifyInstance> {
  const database = new DatabaseSync(":memory:");
  server_database = database;
  open_store(database);
  const sync = { storage: memory_peer_storage(), address: "https://fitness.example.org/api/" };
  app = await build_app({ database, declared: new Map([["root", hash_password(password)]]), web_folder, backups: fake_backups, sync });
  token = (await app.inject({ method: "POST", url: "/api/login", payload: { name: "root", password, device: "tests" } })).json().token;
  return app;
}

// A request as the signed-in tests device.
function signed(options: InjectOptions) {
  return app.inject({ ...options, headers: { ...options.headers, authorization: `Bearer ${token}` } });
}

describe("server", () => {
  it("refuses API calls until signed in, but serves the page", async () => {
    await start();
    expect((await app.inject({ method: "POST", url: "/api/call/get_settings", payload: [] })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/mcp", payload: {} })).statusCode).toBe(401);
    expect((await signed({ method: "POST", url: "/api/call/get_settings", payload: [] })).statusCode).toBe(200);
  });

  it("refuses a percent-encoded API path without sign-in", async () => {
    await start();
    for (const url of ["/%61pi/call/get_settings", "/api/%63all/get_settings", "/%61pi/mcp", "/%61pi/backup/list_backups"]) {
      expect([400, 401]).toContain((await app.inject({ method: "POST", url, payload: [] })).statusCode);
    }
  });

  it("serves the built page beside the API", async () => {
    const folder = mkdtempSync(join(tmpdir(), "x-fitness-web-"));
    writeFileSync(join(folder, "index.html"), "<title>X-Fitness</title>");
    await start(folder);
    expect((await signed({ method: "GET", url: "/" })).body).toContain("X-Fitness");
    expect((await signed({ method: "GET", url: "/api/missing" })).statusCode).toBe(404);
  });

  it("answers the page's calls by name with JSON arguments", async () => {
    await start();
    const write = await signed({ method: "POST", url: "/api/call/set_setting", payload: ["mass_unit", "lb"] });
    expect(write.statusCode).toBe(204);
    const read = await signed({ method: "POST", url: "/api/call/get_settings", payload: [] });
    expect(read.json()).toMatchObject({ mass_unit: "lb", length_unit: "cm" });
  });

  it("takes a call whose argument is a large import file", async () => {
    await start();
    const big = JSON.stringify({ log: "x".repeat(3 * 1024 * 1024) });
    const reply = await signed({ method: "POST", url: "/api/call/set_setting", payload: ["import.test", big] });
    expect(reply.statusCode).toBe(204);
  });

  it("takes the arguments by name as a JSON object too", async () => {
    await start();
    const write = await signed({ method: "POST", url: "/api/call/set_setting", payload: { value: 2500, key: "diet.target_calories" } });
    expect(write.statusCode).toBe(204);
    expect((await signed({ method: "POST", url: "/api/call/get_settings", payload: {} })).json()).toMatchObject({ "diet.target_calories": 2500 });
  });

  it("refuses arguments it cannot place and calls it does not know", async () => {
    await start();
    const unknown_name = await signed({ method: "POST", url: "/api/call/get_settings", payload: { not: "an argument" } });
    expect(unknown_name.statusCode).toBe(400);
    expect(unknown_name.body).toBe("unknown argument not");
    expect((await signed({ method: "POST", url: "/api/call/set_setting", payload: { key: "mass_unit" } })).statusCode).toBe(400);
    expect((await signed({ method: "POST", url: "/api/call/drop_everything", payload: [] })).statusCode).toBeGreaterThanOrEqual(400);
  });

  it("describes every call in an OpenAPI document", async () => {
    await start();
    const document = (await signed({ method: "GET", url: "/api/openapi.json" })).json() as { paths: Record<string, { post: { operationId: string; tags: string[] } }> };
    expect(document.paths["/api/call/get_diary_day"]!.post).toMatchObject({ operationId: "get_diary_day", tags: ["read"] });
    expect(document.paths["/api/call/add_diary_entry"]!.post.tags).toEqual(["change"]);
    expect(Object.keys(document.paths)).toHaveLength(method_names.length);
  });

  it("serves every call as an MCP tool, keeping other services' keys out of what it reads", async () => {
    await start();
    const listed = await mcp("tools/list");
    const tools = listed.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual([...method_names].sort());
    expect(tools.find((tool) => tool.name === "list_workouts")!.annotations.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === "start_workout")!.annotations.readOnlyHint).toBe(false);

    const saved = await mcp("tools/call", { name: "save_exercise", arguments: { exercise: { name: "Squat", measurement: "weight" } } });
    const exercise_id = (saved.content as { text: string }[])[0]!.text;
    const library = await mcp("tools/call", { name: "get_workout_library", arguments: {} });
    expect(JSON.parse((library.content as { text: string }[])[0]!.text).exercises).toContainEqual(expect.objectContaining({ id: exercise_id, name: "Squat" }));

    await signed({ method: "POST", url: "/api/call/set_setting", payload: ["diet.usda_api_key", "not-a-real-key"] });
    const settings = await mcp("tools/call", { name: "get_settings", arguments: {} });
    const values = JSON.parse((settings.content as { text: string }[])[0]!.text) as Record<string, unknown>;
    expect(values).toHaveProperty("mass_unit");
    expect(values).not.toHaveProperty("diet.usda_api_key");
  });

  it("pairs a phone through an admin's code, then syncs it without signing in, and refuses a device it does not know", async () => {
    await start();
    const stranger = await app.inject({ method: "POST", url: "/api/sync/peer", headers: { "content-type": "application/octet-stream", "x-sync-device": "NOBODY" }, payload: Buffer.alloc(64) });
    expect(stranger.statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/sync_device/create_pairing_code", payload: [] })).statusCode).toBe(401);
    const { code } = (await signed({ method: "POST", url: "/api/sync_device/create_pairing_code", payload: [] })).json() as { code: string };

    // The phone reaches the server through the app itself, as it would through the server's proxy.
    const via_app: typeof fetch = async (input, init) => {
      const reply = await app.inject({ method: "POST", url: new URL(String(input)).pathname, headers: init?.headers as Record<string, string>, payload: Buffer.from(init!.body as Uint8Array) });
      return new Response(new Uint8Array(reply.rawPayload), { status: reply.statusCode });
    };
    const phone_database = new DatabaseSync(":memory:");
    open_store(phone_database);
    bind_methods(() => phone_database, () => undefined).set_body_reading("weight", "2026-11-10", 82.5);
    const phone = create_sync_peer({ app: "x-fitness", engine: sync_engine, database: () => phone_database, storage: memory_peer_storage(), device_name: "Phone", fetch: via_app });

    const status = await phone.pair_device(code);
    expect(status.peers.map((peer) => [peer.name, peer.state])).toEqual([["X-Fitness server", "idle"]]);
    expect(bind_methods(() => server_database, () => undefined).get_body_day("2026-11-10").rows.find((row) => row.metric.id === "weight")?.value).toBe(82.5);
  });

  it("lets an admin list and take the server's backups, and refuses unknown backup calls", async () => {
    await start();

    expect((await app.inject({ method: "POST", url: "/api/backup/list_backups", payload: [] })).statusCode).toBe(401);
    const listed = await signed({ method: "POST", url: "/api/backup/list_backups", payload: [] });
    expect(listed.json()).toEqual([taken]);
    expect((await signed({ method: "POST", url: "/api/backup/create_backup", payload: [] })).json()).toEqual(taken);
    expect(fake_backups.create_backup).toHaveBeenCalled();
    expect((await signed({ method: "POST", url: "/api/backup/drop_everything", payload: [] })).statusCode).toBe(404);
  });
});
