// The desktop app's daemon: everything X-Fitness does without a window, being the database, sync, backups, history, the
// MCP endpoint and reminders. The window reaches it over a Unix socket with the same calls a browser makes to the web server, and
// closing the window leaves it running.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import fastify, { type FastifyInstance } from "fastify";
import { Notifier } from "@x-tech-laboratories/x-libs/agent/desktop_notify";
import { keep_giving_scheduled_notices } from "@x-tech-laboratories/x-libs/agent/scheduled_notices";
import { keep_backing_up, type BackupSchedule } from "@x-tech-laboratories/x-libs/backups";
import { create_certificate_trust } from "@x-tech-laboratories/x-libs/certificates";
import { create_local_mcp } from "@x-tech-laboratories/x-libs/electron/mcp";
import { daemon_socket_path, DaemonRunningError, listen_on_socket } from "@x-tech-laboratories/x-libs/local_daemon";
import { register_call_table } from "@x-tech-laboratories/x-libs/server/call_table";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_error_replies, register_lenient_json_body } from "@x-tech-laboratories/x-libs/server/replies";
import { sqlite_backups } from "@x-tech-laboratories/x-libs/server/sqlite_backups";
import { file_sync_storage } from "@x-tech-laboratories/x-libs/sync_file_storage";
import { create_sync_peer, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_peer";
import { keep_listening_for_peers } from "@x-tech-laboratories/x-libs/sync_peer_listening";

import { fitness_backup_naming, read_schedule } from "../shared/backups.ts";
import { fitness_bridge } from "../shared/bridge.ts";
import { read_desktop_settings, type DaemonMethods, type DesktopSettings } from "../shared/desktop.ts";
import { mcp_instructions, without_secrets } from "../shared/mcp.ts";
import { due_reminders } from "../shared/schedule/reminders.ts";
import type { DeviceMethods } from "../shared/page_api.ts";
import { bind_methods, fitness_api, is_read_only, needs_upgrade, open_store, sync_engine } from "../shared/store.ts";
import { register_fitness_calls } from "../server/calls.ts";

// ── Profile ──────────────────────────────────────────────────────────────────

// The window starts it with these set; a run on another database has a socket of its own.
const database_path = process.env.X_FITNESS_DB;
if (!database_path) {
  console.error("x-fitness daemon: X_FITNESS_DB must name the database");
  process.exit(2);
}
const socket_path = process.env.X_FITNESS_SOCKET || daemon_socket_path({ app: "x-fitness", data_file: database_path });
const version = process.env.X_FITNESS_VERSION || "0.0.0";
// The built daemon sits in out/main, and resources/ beside out/ both in the source tree and in the package.
const icon_path = process.env.X_FITNESS_ICON || join(import.meta.dirname, "../../resources/icon.png");

const profile = dirname(database_path);
const backups_folder = join(profile, "backups");

// How long the daemon waits after its last window closed before it stops, when it is not to keep running in the background.
const unused_exit_ms = 30_000;
const unused_check_ms = 5000;

// ── Database ─────────────────────────────────────────────────────────────────

function open_database(): DatabaseSync {
  const opened = new DatabaseSync(database_path!);
  opened.exec("PRAGMA journal_mode = WAL");
  return opened;
}

mkdirSync(profile, { recursive: true });
let database = open_database();

// Every window's event stream, told when the data changed or sync's status moved.
const changes = new EventStream();
const announce_change = (): void => changes.announce_change();

// ── Backups ──────────────────────────────────────────────────────────────────

const kept = sqlite_backups({
  folder: () => {
    mkdirSync(backups_folder, { recursive: true });
    return backups_folder;
  },
  naming: fitness_backup_naming,
  database: () => database,
  database_path: () => database_path,
  close: () => database.close(),
  open: () => {
    database = open_database();
    open_store(database);
  },
  after_restore: (restored) => sync_engine.forget_history(restored),
});

if (needs_upgrade(database)) await kept.create();
open_store(database);

// The schedule belongs to this device, so it is kept beside the database rather than in the synced settings.
const schedule_file = join(profile, "backup-schedule.json");

function read_backup_schedule(): BackupSchedule {
  return read_schedule(existsSync(schedule_file) ? JSON.parse(readFileSync(schedule_file, "utf8")) : null);
}

const backing_up = keep_backing_up(kept, read_backup_schedule);

// ── Sync ─────────────────────────────────────────────────────────────────────

// Certificates the user trusted for a paired device's https address, such as a home server's self-signed one, handed to Node's own fetch.
const certificates = create_certificate_trust({ file: join(profile, "trusted-certificates.json"), use_in_node: true });

// "Let other devices connect", off until the user turns it on, so paired devices can reach this computer without a server.
const listening = keep_listening_for_peers({ peer: () => sync, app: "x-fitness", file: join(profile, "sync-listening.json"), default_port: 3931 });

const sync = create_sync_peer({
  app: "x-fitness",
  engine: sync_engine,
  database: () => database,
  storage: file_sync_storage({ file: join(profile, "sync-peers.json"), back_up_before_replace: async () => void (await kept.create()) }),
  device_name: `X-Fitness on ${hostname()}`,
  addresses: () => listening.addresses(),
  on_remote_change: announce_change,
  on_status: (status) => changes.send(JSON.stringify(status), { event: "sync_status" }),
});

// ── MCP ──────────────────────────────────────────────────────────────────────

// Off until turned on in Settings; a change made through it reaches the open window and syncs like any other.
const local_mcp = create_local_mcp({
  name: "x-fitness",
  version,
  instructions: mcp_instructions,
  api: fitness_api,
  is_read_only,
  settings_file: join(profile, "mcp.json"),
  default_port: 3918,
  call: async (method, args) => without_secrets(method, await fitness_bridge.dispatch(bind_methods(() => database, announce_change), method, args)),
});

// ── Desktop settings ─────────────────────────────────────────────────────────

const desktop_file = join(profile, "desktop.json");

function read_desktop(): DesktopSettings {
  return read_desktop_settings(existsSync(desktop_file) ? JSON.parse(readFileSync(desktop_file, "utf8")) : null);
}

// ── Reminders ────────────────────────────────────────────────────────────────

// Where the reminders got to, so one that fell while the daemon was stopped still shows, if it is not long past.
const reminders_file = join(profile, "reminders.json");
const most_late_reminder_ms = 15 * 60 * 1000;

function remind(): () => void {
  const notifier = new Notifier({ app_name: "X-Fitness", icons: { app: icon_path }, on_error: (message) => console.error(message) });
  return keep_giving_scheduled_notices({
    notifier,
    due: (after, until) => due_reminders(database, new Date(after), new Date(until)).map((reminder) => ({ ...reminder, icon: "app" })),
    read_checked_until: () => (existsSync(reminders_file) ? Number((JSON.parse(readFileSync(reminders_file, "utf8")) as { checked_until?: unknown }).checked_until) || null : null),
    write_checked_until: (moment) => writeFileSync(reminders_file, JSON.stringify({ checked_until: moment })),
    most_late_ms: most_late_reminder_ms,
    on_error: (error) => console.error(error),
  });
}

// ── Calls ────────────────────────────────────────────────────────────────────

function device_methods(): DeviceMethods {
  return {
    ...sync_device_methods(sync),
    list_backups: kept.list,
    create_backup: () => kept.create(),
    // The restored copy then reaches every paired device, which backs itself up first.
    restore_backup: async (name) => {
      await kept.restore(name);
    },
    remove_backup: kept.remove,
    get_backup_schedule: read_backup_schedule,
    set_backup_schedule: (schedule) => {
      writeFileSync(schedule_file, JSON.stringify(read_schedule(schedule), null, 2));
      void backing_up.check();
    },
  };
}

function daemon_methods(shut_down: () => void): DaemonMethods {
  return {
    get_desktop_settings: read_desktop,
    set_desktop_setting: (key, value) => writeFileSync(desktop_file, JSON.stringify(read_desktop_settings({ ...read_desktop(), [key]: value }), null, 2)),
    // Stops once the answer has gone back.
    stop_daemon: () => void setTimeout(shut_down, 0),
  };
}

async function build_daemon(shut_down: () => void): Promise<FastifyInstance> {
  const daemon = fastify({ bodyLimit: 4 * 1024 * 1024, forceCloseConnections: true });
  register_lenient_json_body(daemon);
  register_error_replies(daemon);
  // A change from one window reaches the others; the one that made it already shows it.
  const tell_others = (client_id: string): void => changes.announce_change(client_id);
  await daemon.register(
    async (api) => {
      changes.register(api, "/events");
      register_fitness_calls(api, () => database, changes);
      register_call_table(api, "/device", device_methods(), { is_read_only, on_change: tell_others });
      register_call_table(api, "/certificates", certificates.methods, { is_read_only });
      register_call_table(api, "/listening", listening.methods, { is_read_only });
      register_call_table(api, "/local_mcp", local_mcp.methods, { is_read_only });
      register_call_table(api, "/daemon", daemon_methods(shut_down), { is_read_only, on_change: tell_others });
    },
    { prefix: "/api" },
  );
  return daemon;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let is_stopping = false;
  let unused_timer: ReturnType<typeof setInterval> | undefined;
  let stop_reminders = (): void => {};
  const daemon = await build_daemon(() => shut_down());

  function shut_down(): void {
    if (is_stopping) return;
    is_stopping = true;
    clearInterval(unused_timer);
    stop_reminders();
    sync.stop();
    void listening.stop();
    backing_up.stop();
    void daemon
      .close()
      .then(() => local_mcp.stop())
      .finally(() => {
        database.close();
        process.exit(0);
      });
  }

  try {
    await listen_on_socket(socket_path, (path) => daemon.listen({ path }));
  } catch (error) {
    // Another daemon on this database got there first, which is all that was asked for.
    if (error instanceof DaemonRunningError) process.exit(0);
    throw error;
  }
  console.log(`x-fitness daemon on ${socket_path}, using ${database_path}`);

  await listening.start();
  sync.start();
  void local_mcp.start();
  stop_reminders = remind();

  // Without "Keep running in the background", the daemon stops a while after its last window has gone.
  let unused_since = Date.now();
  unused_timer = setInterval(() => {
    if (changes.client_count > 0 || read_desktop().keep_running_in_background) unused_since = Date.now();
    else if (Date.now() - unused_since >= unused_exit_ms) shut_down();
  }, unused_check_ms);

  process.on("SIGINT", shut_down);
  process.on("SIGTERM", shut_down);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
