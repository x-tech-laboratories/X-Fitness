import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";

import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { hash_password } from "@x-tech-laboratories/x-libs/server/passwords";

import { build_app } from "../src/server/app.ts";
import { method_names, open_store } from "../src/shared/store.ts";

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

const status = { state: "off", server_url: "", user: "", last_synced_at: "", pending_changes: 0, error: "" } as const;
const fake_device = { ...fake_backups, get_sync_status: vi.fn(() => status), connect_sync: vi.fn(async () => status), disconnect_sync: vi.fn(() => status), sync_now: vi.fn(async () => status) };
const fake_certificates = { check_certificate: vi.fn(async () => null), trust_certificate: vi.fn(async () => []), list_trusted_certificates: vi.fn(() => []), forget_certificate: vi.fn(() => []) };
const fake_local_mcp = { get_local_mcp_settings: vi.fn(() => ({ enabled: false, port: 3918 })), set_local_mcp_settings: vi.fn(async () => undefined), get_local_mcp_status: vi.fn(async () => ({ state: "off" as const, url: "", error: "" })) };

// The daemon as a server runs it, signed in as an admin from the accounts file, or as a desktop's socket with no sign-in.
async function start(web_folder = "/nonexistent", on_socket = false): Promise<FastifyInstance> {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  app = await build_app({
    database: () => database,
    changes: new EventStream(),
    declared: on_socket ? null : new Map([["root", hash_password(password)]]),
    web_folder,
    backups: fake_backups,
    device: fake_device,
    certificates: fake_certificates,
    local_mcp: fake_local_mcp,
  });
  if (!on_socket) token = (await app.inject({ method: "POST", url: "/api/login", payload: { name: "root", password, device: "tests" } })).json().token;
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

  it("serves sync to devices", async () => {
    await start();
    const snapshot = await signed({ method: "GET", url: "/api/sync/snapshot" });
    expect(snapshot.statusCode).toBe(200);
    const { generation, changes } = snapshot.json() as { generation: string; changes: { table: string; key: string }[] };
    expect(generation).not.toBe("");
    expect(changes).toContainEqual(expect.objectContaining({ table: "body_metrics", key: "weight" }));
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

  it("answers the same handlers on the network for an admin only", async () => {
    await start();
    // Users are managed from a session, never with a token.
    const session = (await app.inject({ method: "POST", url: "/api/login", payload: { name: "root", password } })).headers["set-cookie"] as string | string[];
    const cookie = (Array.isArray(session) ? session[0]! : session).split(";")[0]!;
    const added = await app.inject({ method: "POST", url: "/api/users", payload: { name: "sam", password, role: "user" }, headers: { cookie } });
    expect(added.statusCode).toBeLessThan(300);
    const sam = (await app.inject({ method: "POST", url: "/api/login", payload: { name: "sam", password, device: "tests" } })).json().token as string;
    const as_sam = (url: string) => app.inject({ method: "POST", url, payload: [], headers: { authorization: `Bearer ${sam}` } });

    expect((await as_sam("/api/call/get_settings")).statusCode).toBe(200);
    for (const url of ["/api/device/get_sync_status", "/api/certificates/list_trusted_certificates", "/api/local_mcp/get_local_mcp_settings", "/api/backup/list_backups"]) {
      expect((await app.inject({ method: "POST", url, payload: [] })).statusCode).toBe(401);
      expect((await as_sam(url)).statusCode).toBe(403);
      expect((await signed({ method: "POST", url, payload: [] })).statusCode).toBe(200);
    }
    expect((await signed({ method: "POST", url: "/api/daemon/stop_daemon", payload: [] })).statusCode).toBe(404);
  });

  it("needs no sign-in on a desktop's socket", async () => {
    await start("/nonexistent", true);
    expect((await app.inject({ method: "POST", url: "/api/call/get_settings", payload: [] })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/device/get_sync_status", payload: [] })).json()).toEqual(status);
    expect((await app.inject({ method: "POST", url: "/api/login", payload: { name: "root", password } })).statusCode).toBe(404);
  });
});
