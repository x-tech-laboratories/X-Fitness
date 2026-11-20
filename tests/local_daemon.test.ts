// The desktop app's local daemon as a process of its own, on a throwaway database with a socket of its own: the page's
// calls over the socket with no sign-in, the device's sync and backups, its certificates and MCP settings, change events,
// one daemon per socket, and stopping.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { call_daemon, follow_daemon_events, is_answering } from "@x-tech-laboratories/x-libs/local_daemon";

// ── Daemon process ───────────────────────────────────────────────────────────

const daemon_script = join(import.meta.dirname, "../src/daemon/main.ts");
const daemon_args: string[] = [];

interface Running {
  child: ChildProcess;
  profile: string;
  socket: string;
  exited: Promise<number | null>;
  output: () => string;
}

const started: Running[] = [];

function run_daemon(profile: string, socket: string): Running {
  const env: NodeJS.ProcessEnv = { ...process.env, X_FITNESS_DB: join(profile, "fitness.db"), X_FITNESS_SOCKET: socket, X_FITNESS_VERSION: "9.9.9", XDG_RUNTIME_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", daemon_script, ...daemon_args], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout!.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr!.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  const running = { child, profile, socket, exited, output: () => output };
  started.push(running);
  return running;
}

async function until(check: () => Promise<boolean> | boolean, what: string, timeout_ms = 20_000): Promise<void> {
  const deadline = Date.now() + timeout_ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function start_daemon(): Promise<Running> {
  const profile = mkdtempSync(join(tmpdir(), "x-fitness-daemon-"));
  const running = run_daemon(profile, join(profile, "x-fitness", "daemon-test.sock"));
  await until(async () => (await is_answering(running.socket)) || running.child.exitCode !== null, "the daemon to answer");
  if (running.child.exitCode !== null) throw new Error(`the daemon exited: ${running.output()}`);
  return running;
}

afterEach(async () => {
  for (const running of started.splice(0)) {
    if (running.child.exitCode === null) {
      running.child.kill("SIGTERM");
      await running.exited;
    }
    rmSync(running.profile, { recursive: true, force: true });
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("the local daemon", () => {
  it("answers the page's calls over its socket with no sign-in", async () => {
    const daemon = await start_daemon();

    await call_daemon(daemon.socket, "/api/call/set_setting", ["mass_unit", "lb"]);

    expect(await call_daemon(daemon.socket, "/api/call/get_settings")).toMatchObject({ mass_unit: "lb" });
    await expect(call_daemon(daemon.socket, "/api/call/drop_everything")).rejects.toThrow();
  }, 30_000);

  it("keeps the device's backups in the profile and reports sync not set up", async () => {
    const daemon = await start_daemon();

    expect(await call_daemon(daemon.socket, "/api/device/get_backup_schedule")).toEqual({ automatic: true, to_keep: 14 });
    const taken = (await call_daemon(daemon.socket, "/api/device/create_backup")) as { name: string };
    expect(readdirSync(join(daemon.profile, "backups"))).toContain(taken.name);
    expect(await call_daemon(daemon.socket, "/api/device/list_backups")).toContainEqual(expect.objectContaining({ name: taken.name }));
    expect(await call_daemon(daemon.socket, "/api/device/get_sync_status")).toMatchObject({ state: "off", server_url: "" });
  }, 30_000);

  it("answers its certificates and its own MCP endpoint's settings", async () => {
    const daemon = await start_daemon();

    expect(await call_daemon(daemon.socket, "/api/certificates/list_trusted_certificates")).toEqual([]);
    expect(await call_daemon(daemon.socket, "/api/local_mcp/get_local_mcp_settings")).toMatchObject({ enabled: false });
  }, 30_000);

  it("tells the other windows of a change, but not the one that made it", async () => {
    const daemon = await start_daemon();
    const heard: string[] = [];
    let client_id = "";
    const stop = follow_daemon_events(daemon.socket, "/api/events", (event, data) => {
      if (event === "hello") client_id = data;
      else heard.push(event);
    });
    try {
      await until(() => client_id !== "", "the hello event");

      await call_daemon(daemon.socket, "/api/call/set_setting", ["mass_unit", "lb"], { "x-client-id": client_id });
      await call_daemon(daemon.socket, "/api/call/set_setting", ["mass_unit", "kg"]);

      await until(() => heard.includes("changed"), "a change event");
      expect(heard.filter((event) => event === "changed")).toHaveLength(1);
    } finally {
      stop();
    }
  }, 30_000);

  it("leaves a second daemon on the same socket to exit at once", async () => {
    const daemon = await start_daemon();

    const second = run_daemon(daemon.profile, daemon.socket);

    expect(await second.exited).toBe(0);
    expect(await is_answering(daemon.socket)).toBe(true);
  }, 30_000);

  it("stops when asked, and closes its database", async () => {
    const daemon = await start_daemon();

    await call_daemon(daemon.socket, "/api/daemon/stop_daemon");

    expect(await daemon.exited).toBe(0);
    expect(existsSync(join(daemon.profile, "fitness.db"))).toBe(true);
  }, 30_000);
});
