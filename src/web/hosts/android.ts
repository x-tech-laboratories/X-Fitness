// The phone's page: it keeps its own database, answers its calls on it, backs it up daily, syncs with the devices it is
// paired with, and hands Android its reminders ahead of time.

// ── Imports ──────────────────────────────────────────────────────────────────

import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { keep_backing_up } from "@x-tech-laboratories/x-libs/backups";
import { phone_backups } from "@x-tech-laboratories/x-libs/phone_backups";
import { phone_certificates } from "@x-tech-laboratories/x-libs/phone_certificates";
import { keep_phone_notices } from "@x-tech-laboratories/x-libs/phone_notices";
import { create_sync_peer, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_peer";
import { indexed_db_files, open_wasm_database } from "@x-tech-laboratories/x-libs/web/sqlite_wasm";
import { local_sync_storage } from "@x-tech-laboratories/x-libs/web/sync_storage";

import { fitness_backup_naming, read_schedule } from "../../shared/backups.ts";
import { route_of_link } from "../../shared/links.ts";
import type { DeviceMethods, PageApi } from "../../shared/page_api.ts";
import { reminders_between } from "../../shared/schedule/reminders.ts";
import { bind_methods, needs_upgrade, open_store, sync_engine, type FitnessMethods } from "../../shared/store.ts";

// ── Files ────────────────────────────────────────────────────────────────────

const files = indexed_db_files("x-fitness");
const database_file = "fitness.db";
const sync_peers_key = "x-fitness-sync-peers";
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
  const listeners = new Set<() => void>();
  const announce = (): void => {
    for (const listener of listeners) listener();
  };

  // Backups go to a folder the user picks in the phone's storage; the ones taken on their own wait until there is one.
  // A restore then reaches every paired device, which backs itself up first.
  const kept = phone_backups({
    naming: fitness_backup_naming,
    database,
    after_restore: (connection) => {
      open_store(connection);
      sync_engine.forget_history(connection);
    },
  });
  const back_up_if_folder = async (): Promise<void> => {
    if (await kept.folder_name()) await kept.create();
  };

  if (needs_upgrade(database.connection)) await back_up_if_folder();
  open_store(database.connection);
  await database.save_now();
  const backing_up = keep_backing_up(kept, read_backup_schedule);

  // Reminders are set again after every change here or from the server, and whenever the app comes back; a tap opens
  // the page to log it. Leave to show them is asked for only once there is something to remind of.
  const notices = keep_phone_notices({
    plugin: LocalNotifications,
    read: (now, until) => {
      const reminders = reminders_between(database.connection, new Date(now), new Date(until));
      if (reminders.length > 0) void notices.ask_permission();
      return reminders.map((reminder) => ({ key: reminder.key, title: reminder.title, body: reminder.body, at: reminder.at, extra: { url: reminder.url } }));
    },
    on_tap: (extra) => {
      const route = route_of_link(extra.url ?? "");
      if (route) location.hash = route;
    },
  });
  const changed = (): void => {
    announce();
    notices.refresh();
  };

  // The phone's keys and paired devices stay in the app's private storage, never in the synced data.
  const storage = local_sync_storage({ key: sync_peers_key, back_up_before_replace: back_up_if_folder });
  const sync = create_sync_peer({ app: "x-fitness", engine: sync_engine, database: () => database.connection, storage, device_name: "X-Fitness on Android", on_remote_change: changed });

  // A phone may close the app at any moment once it is in the background, so the database is saved straight away.
  void App.addListener("pause", () => void database.save_now());
  void App.addListener("resume", () => {
    void sync.sync_now();
    notices.refresh();
  });
  sync.start();
  notices.refresh();

  // The page tells its own views of its writes, so a write here only sets the reminders again.
  const methods: FitnessMethods = bind_methods(() => database.connection, () => notices.refresh());
  const device: DeviceMethods = {
    ...sync_device_methods(sync),
    list_backups: kept.list,
    create_backup: () => kept.create(),
    // The current data is backed up first, and the restored copy then reaches every paired device.
    restore_backup: async (name) => {
      await kept.restore(name);
      changed();
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
    certificates: phone_certificates(),
    backups: device_client,
    backup_folder: {
      get: kept.folder_name,
      // A newly picked folder may already hold backups, and daily ones can start in it.
      choose: async () => {
        const name = await kept.choose_folder();
        await backing_up.check();
        return name;
      },
    },
    on_change: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
