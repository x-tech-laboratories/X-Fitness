// What every X-Fitness daemon holds, run headless on a server or as a desktop's local daemon: the database, its backups,
// sync with another daemon, the certificates that sync trusts, and the MCP endpoint on 127.0.0.1. Each mode in main.ts
// serves these through the same handlers in app.ts.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { keep_backing_up, type BackupSchedule } from "@x-tech-laboratories/x-libs/backups";
import type { BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import { create_certificate_trust } from "@x-tech-laboratories/x-libs/certificates";
import { create_local_mcp } from "@x-tech-laboratories/x-libs/electron/mcp";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { sqlite_backups, take_staged_restore } from "@x-tech-laboratories/x-libs/server/sqlite_backups";
import { create_sync_client, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_client";
import { file_sync_storage } from "@x-tech-laboratories/x-libs/sync_file_storage";

import { fitness_backup_naming, read_schedule } from "../shared/backups.ts";
import { fitness_bridge } from "../shared/bridge.ts";
import { mcp_instructions, without_secrets } from "../shared/mcp.ts";
import type { DeviceMethods } from "../shared/page_api.ts";
import { bind_methods, fitness_api, is_read_only, needs_upgrade, open_store, sync_engine } from "../shared/store.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface DaemonOptions {
  database_path: string;
  backups_folder: string;
  version: string;
  // How a restore takes the backup's place: at once under a closed connection, or staged for the next start when other
  // parts hold the connection, such as a server's accounts; `after_staging` then stops the daemon.
  restore: "in_place" | { after_staging: () => void };
}

export type Daemon = Awaited<ReturnType<typeof open_daemon>>;

// ── Daemon ───────────────────────────────────────────────────────────────────

// Opens the database, upgrading it after a backup, and readies everything that runs on it; `start` sets it going.
export async function open_daemon(options: DaemonOptions) {
  const { database_path, backups_folder, version } = options;
  const data_folder = dirname(database_path);

  function open_database(): DatabaseSync {
    const opened = new DatabaseSync(database_path);
    opened.exec("PRAGMA journal_mode = WAL");
    return opened;
  }

  mkdirSync(data_folder, { recursive: true });
  // A backup restored on a server waits beside the database until the daemon starts again.
  const restored = options.restore !== "in_place" && take_staged_restore(database_path);
  let database = open_database();

  // Every page's event stream, told when the data changed or sync's status moved.
  const changes = new EventStream();
  const announce_change = (): void => changes.announce_change();

  // ── Backups ────────────────────────────────────────────────────────────

  const kept = sqlite_backups({
    folder: () => {
      mkdirSync(backups_folder, { recursive: true });
      return backups_folder;
    },
    naming: fitness_backup_naming,
    database: () => database,
    database_path: () => database_path,
    ...(options.restore === "in_place"
      ? {
          close: () => database.close(),
          open: () => {
            database = open_database();
            open_store(database);
          },
          after_restore: (restored_database) => sync_engine.forget_history(restored_database),
        }
      : { after_staging: options.restore.after_staging }),
  });

  if (needs_upgrade(database)) await kept.create();
  open_store(database);
  // The restored data is no longer what the other daemons last saw, so each chooses again which copy to keep.
  if (restored) sync_engine.forget_history(database);

  // The schedule belongs to this daemon, so it is kept beside the database rather than in the synced settings.
  const schedule_file = join(data_folder, "backup-schedule.json");
  const read_backup_schedule = (): BackupSchedule => read_schedule(existsSync(schedule_file) ? JSON.parse(readFileSync(schedule_file, "utf8")) : null);
  const backing_up = keep_backing_up(kept, read_backup_schedule);

  // ── Sync ───────────────────────────────────────────────────────────────

  // Certificates the user trusted for sync, such as a home server's self-signed one, handed to Node's own fetch.
  const certificates = create_certificate_trust({ file: join(data_folder, "trusted-certificates.json"), use_in_node: true });

  const sync = create_sync_client({
    engine: sync_engine,
    database: () => database,
    storage: file_sync_storage({ file: join(data_folder, "sync.json"), back_up_before_download: async () => void (await kept.create()) }),
    data_name: "fitness data",
    device_name: `X-Fitness on ${hostname()}`,
    on_remote_change: announce_change,
    on_status: (status) => changes.send(JSON.stringify(status), { event: "sync_status" }),
  });

  // ── MCP ────────────────────────────────────────────────────────────────

  // Off until turned on in Settings; a change made through it reaches the open pages and syncs like any other.
  const local_mcp = create_local_mcp({
    name: "x-fitness",
    version,
    instructions: mcp_instructions,
    api: fitness_api,
    is_read_only,
    settings_file: join(data_folder, "mcp.json"),
    default_port: 3918,
    call: async (method, args) => without_secrets(method, await fitness_bridge.dispatch(bind_methods(() => database, announce_change), method, args)),
  });

  // ── Calls ──────────────────────────────────────────────────────────────

  const backups: BackupMethods = {
    list_backups: kept.list,
    create_backup: () => kept.create(),
    // The restored data no longer matches the other daemon's, so sync waits until the user picks which copy wins.
    restore_backup: async (name) => {
      sync.disconnect();
      await kept.restore(name);
    },
    remove_backup: kept.remove,
    get_backup_schedule: read_backup_schedule,
    set_backup_schedule: (schedule) => {
      writeFileSync(schedule_file, JSON.stringify(read_schedule(schedule), null, 2));
      void backing_up.check();
    },
  };

  const device: DeviceMethods = { ...sync_device_methods(sync), ...backups };

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function start(): void {
    sync.start();
    void local_mcp.start();
  }

  async function stop(): Promise<void> {
    sync.stop();
    backing_up.stop();
    await local_mcp.stop();
  }

  return {
    database: () => database,
    changes,
    backups,
    device,
    certificates: certificates.methods,
    local_mcp: local_mcp.methods,
    start,
    stop,
    close: () => database.close(),
  };
}
