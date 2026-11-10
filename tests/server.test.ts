import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { build_app } from "../src/server/app.ts";
import { open_store } from "../src/shared/store.ts";

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

async function start(web_folder = "/nonexistent"): Promise<FastifyInstance> {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  app = await build_app({ database, secret: "", web_folder, back_up: vi.fn() });
  return app;
}

describe("server", () => {
  it("serves the built page beside the API", async () => {
    const folder = mkdtempSync(join(tmpdir(), "x-fitness-web-"));
    writeFileSync(join(folder, "index.html"), "<title>X-Fitness</title>");
    await start(folder);
    expect((await app.inject({ method: "GET", url: "/" })).body).toContain("X-Fitness");
    expect((await app.inject({ method: "GET", url: "/api/missing" })).statusCode).toBe(404);
  });

  it("answers the page's calls by name with JSON arguments", async () => {
    await start();
    const write = await app.inject({ method: "POST", url: "/api/call/set_setting", payload: ["mass_unit", "lb"] });
    expect(write.statusCode).toBe(204);
    const read = await app.inject({ method: "POST", url: "/api/call/get_settings", payload: [] });
    expect(read.json()).toEqual({ mass_unit: "lb" });
  });

  it("refuses arguments that are not a list and calls it does not know", async () => {
    await start();
    expect((await app.inject({ method: "POST", url: "/api/call/get_settings", payload: { not: "a list" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/call/drop_everything", payload: [] })).statusCode).toBeGreaterThanOrEqual(400);
  });

  it("serves sync to devices", async () => {
    await start();
    const snapshot = await app.inject({ method: "GET", url: "/api/sync/snapshot" });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({ changes: [] });
  });
});
