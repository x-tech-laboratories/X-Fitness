// The phone's page: it keeps its own database, answers its calls on it, backs it up daily, and syncs with a server when
// one is set.

// ── Imports ──────────────────────────────────────────────────────────────────

import { App } from "@capacitor/app";
import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { backups, keep_backing_up } from "@x-tech-laboratories/x-libs/backups";
import { create_sync_client, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_client";
import { indexed_db_files, open_wasm_database } from "@x-tech-laboratories/x-libs/web/sqlite_wasm";
import { local_sync_storage } from "@x-tech-laboratories/x-libs/web/sync_storage";

import { fitness_backup_naming, read_schedule } from "../../shared/backups.ts";
import type { DeviceMethods, PageApi } from "../../shared/page_api.ts";
import { bind_methods, needs_upgrade, open_store, sync_engine, type FitnessMethods } from "../../shared/store.ts";
import { indexed_db_backup_store, read_backup } from "./android_backups.ts";

// ── Files ────────────────────────────────────────────────────────────────────

const files = indexed_db_files("x-fitness");
const database_file = "fitness.db";
const backups_database = "x-fitness-backups";
const sync_config_key = "x-fitness-sync";
// The schedule belongs to this phone, so it is kept in its own storage rather than in the synced settings.
const schedule_key = "x-fitness-backup-schedule";

function read_backup_schedule() {
  try {
    return read_schedule(JSON.parse(localStorage.getItem(schedule_key) ?? "null"));
  } catch {
    return read_schedule(null);
  }
}

// ── Api ──────────────────────────────────────────────────────────────────────

// Each call runs straight on the database in this page; answers are promises, as they are on the other hosts.
function as_client<Methods extends { [Name in keyof Methods]: (...args: never[]) => unknown }>(methods: Methods): Client<Methods> {
  const entries = Object.entries(methods as Record<string, (...args: never[]) => unknown>).map(([name, method]) => [name, async (...args: never[]) => method(...args)]);
  return Object.fromEntries(entries) as Client<Methods>;
}

export async function android_api(): Promise<PageApi> {
  const database = await open_wasm_database({ files, file_name: database_file });
  const kept = backups(fitness_backup_naming, indexed_db_backup_store(backups_database, database.export_bytes));
  if (needs_upgrade(database.connection)) await kept.create();
  open_store(database.connection);
  await database.save_now();
  const backing_up = keep_backing_up(kept, read_backup_schedule);

  const listeners = new Set<() => void>();
  const announce = (): void => {
    for (const listener of listeners) listener();
  };

  // The server and token stay in the app's private storage, never in the synced data.
  const storage = local_sync_storage({ key: sync_config_key, back_up_before_download: async () => void (await kept.create()) });
  const sync = create_sync_client({ engine: sync_engine, database: () => database.connection, storage, data_name: "fitness data", device_name: "X-Fitness on Android", on_remote_change: announce });

  // A phone may close the app at any moment once it is in the background, so the database is saved straight away.
  void App.addListener("pause", () => void database.save_now());
  void App.addListener("resume", () => void sync.sync_now());
  sync.start();

  const methods: FitnessMethods = bind_methods(() => database.connection, () => undefined);
  const device: DeviceMethods = {
    ...sync_device_methods(sync),
    list_backups: kept.list,
    create_backup: () => kept.create(),
    // The current data is backed up first, and sync waits until the user picks which copy wins.
    restore_backup: async (name) => {
      const bytes = await read_backup(backups_database, name);
      await kept.create();
      sync.disconnect();
      database.replace_with(bytes);
      open_store(database.connection);
      sync_engine.forget_history(database.connection);
      await database.save_now();
      announce();
    },
    remove_backup: kept.remove,
    get_backup_schedule: read_backup_schedule,
    set_backup_schedule: (schedule) => {
      localStorage.setItem(schedule_key, JSON.stringify(read_schedule(schedule)));
      void backing_up.check();
    },
  };
  const device_client = as_client(device);
  return {
    host: "android",
    calls: as_client(methods),
    device: device_client,
    backups: device_client,
    on_change: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
