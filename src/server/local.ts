// The daemon as a desktop's local daemon: the same handlers as on a server, on a Unix socket only this user can open and
// so with no sign-in, plus the desktop's reminders and stopping. The desktop app starts it on Electron's own binary as
// Node, and closing the window leaves it running.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Notifier } from "@x-tech-laboratories/x-libs/agent/desktop_notify";
import { keep_giving_scheduled_notices } from "@x-tech-laboratories/x-libs/agent/scheduled_notices";
import { daemon_socket_path, DaemonRunningError, listen_on_socket } from "@x-tech-laboratories/x-libs/local_daemon";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { read_desktop_settings } from "../shared/desktop.ts";
import { due_reminders } from "../shared/schedule/reminders.ts";
import { build_app } from "./app.ts";
import { open_daemon } from "./daemon.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface LocalOptions {
  database_path: string;
  // The socket; the user's own one for the installed app's database, one of its own for any other.
  socket_path: string;
  version: string;
  icon_path: string;
}

// The desktop app starts it with these set; a run on another database has a socket of its own.
export function local_options_from(env: NodeJS.ProcessEnv): LocalOptions {
  const database_path = env.X_FITNESS_DB;
  if (!database_path) throw new Error("X_FITNESS_DB must name the database");
  return {
    database_path,
    socket_path: env.X_FITNESS_SOCKET || daemon_socket_path({ app: "x-fitness", data_file: database_path }),
    version: env.X_FITNESS_VERSION || "0.0.0",
    // The built daemon sits in out/main, and resources/ beside out/ both in the source tree and in the package.
    icon_path: env.X_FITNESS_ICON || join(import.meta.dirname, "../../resources/icon.png"),
  };
}

// How long the daemon waits after its last window closed before it stops, when it is not to keep running in the background.
const unused_exit_ms = 30_000;
const unused_check_ms = 5000;

// Where the reminders got to, so one that fell while the daemon was stopped still shows, if it is not long past.
const most_late_reminder_ms = 15 * 60 * 1000;

// ── Reminders ────────────────────────────────────────────────────────────────

function remind(database: () => SqlDatabase, profile: string, icon_path: string): () => void {
  const reminders_file = join(profile, "reminders.json");
  const notifier = new Notifier({ app_name: "X-Fitness", icons: { app: icon_path }, on_error: (message) => console.error(message) });
  return keep_giving_scheduled_notices({
    notifier,
    due: (after, until) => due_reminders(database(), new Date(after), new Date(until)).map((reminder) => ({ ...reminder, icon: "app" })),
    read_checked_until: () => (existsSync(reminders_file) ? Number((JSON.parse(readFileSync(reminders_file, "utf8")) as { checked_until?: unknown }).checked_until) || null : null),
    write_checked_until: (moment) => writeFileSync(reminders_file, JSON.stringify({ checked_until: moment })),
    most_late_ms: most_late_reminder_ms,
    on_error: (error) => console.error(error),
  });
}

// ── Run ──────────────────────────────────────────────────────────────────────

export async function run_local_daemon(options: LocalOptions): Promise<void> {
  const { database_path, socket_path } = options;
  const profile = dirname(database_path);
  const desktop_file = join(profile, "desktop.json");
  const keeps_running = (): boolean => read_desktop_settings(existsSync(desktop_file) ? JSON.parse(readFileSync(desktop_file, "utf8")) : null).keep_running_in_background;

  const daemon = await open_daemon({ database_path, backups_folder: join(profile, "backups"), version: options.version, restore: "in_place" });

  let is_stopping = false;
  let unused_timer: ReturnType<typeof setInterval> | undefined;
  let stop_reminders = (): void => {};

  const app = await build_app({
    database: daemon.database,
    changes: daemon.changes,
    declared: null,
    backups: daemon.backups,
    device: daemon.device,
    certificates: daemon.certificates,
    local_mcp: daemon.local_mcp,
    // Stops once the answer has gone back.
    daemon: { stop_daemon: () => void setTimeout(shut_down, 0) },
  });

  function shut_down(): void {
    if (is_stopping) return;
    is_stopping = true;
    clearInterval(unused_timer);
    stop_reminders();
    void app
      .close()
      .then(() => daemon.stop())
      .finally(() => {
        daemon.close();
        process.exit(0);
      });
  }

  try {
    await listen_on_socket(socket_path, (path) => app.listen({ path }));
  } catch (error) {
    // Another daemon on this database got there first, which is all that was asked for.
    if (error instanceof DaemonRunningError) {
      await app.close();
      await daemon.stop();
      daemon.close();
      process.exit(0);
    }
    throw error;
  }
  console.log(`x-fitness daemon on ${socket_path}, using ${database_path}`);

  daemon.start();
  stop_reminders = remind(daemon.database, profile, options.icon_path);

  // Without "Keep running in the background", the daemon stops a while after its last window has gone.
  let unused_since = Date.now();
  unused_timer = setInterval(() => {
    if (daemon.changes.client_count > 0 || keeps_running()) unused_since = Date.now();
    else if (Date.now() - unused_since >= unused_exit_ms) shut_down();
  }, unused_check_ms);

  process.on("SIGINT", shut_down);
  process.on("SIGTERM", shut_down);
}
