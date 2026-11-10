// The desktop app: its own database in the profile folder, the page's calls answered on it, daily backups beside it,
// and sync with a server when one is set, so it works offline and catches up once the server answers.

// ── Imports ──────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from "electron";
import { bring_to_front, hold_single_instance } from "@x-tech-laboratories/x-libs/electron/app";
import type { IpcMainEventLike } from "@x-tech-laboratories/x-libs/electron/bridge";
import { create_window, is_app_page } from "@x-tech-laboratories/x-libs/electron/window";
import { keep_backing_up, type BackupSchedule } from "@x-tech-laboratories/x-libs/backups";
import { sqlite_backups } from "@x-tech-laboratories/x-libs/server/sqlite_backups";
import { create_sync_client, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_client";
import { file_sync_storage } from "@x-tech-laboratories/x-libs/sync_file_storage";

import { fitness_backup_naming, read_schedule } from "../shared/backups.ts";
import { device_bridge, fitness_bridge, fitness_events } from "../shared/bridge.ts";
import { bind_methods, needs_upgrade, open_store, sync_engine } from "../shared/store.ts";

// ── Profile ──────────────────────────────────────────────────────────────────

// Dev runs set this so they never touch the installed app's data.
if (process.env.X_FITNESS_USER_DATA) app.setPath("userData", join(process.cwd(), process.env.X_FITNESS_USER_DATA));

const profile = app.getPath("userData");
const backups_folder = join(profile, "backups");

// ── Database ─────────────────────────────────────────────────────────────────

const database_path = join(profile, "fitness.db");
mkdirSync(profile, { recursive: true });
let database = new DatabaseSync(database_path);
database.exec("PRAGMA journal_mode = WAL");

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
    database = new DatabaseSync(database_path);
    database.exec("PRAGMA journal_mode = WAL");
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

function announce_change(): void {
  fitness_events.emit(BrowserWindow.getAllWindows(), "changed", null);
}

// ── Sync ─────────────────────────────────────────────────────────────────────

const sync = create_sync_client({
  engine: sync_engine,
  database: () => database,
  storage: file_sync_storage({ file: join(profile, "sync.json"), back_up_before_download: async () => void (await kept.create()) }),
  data_name: "fitness data",
  device_name: `X-Fitness on ${hostname()}`,
  on_remote_change: announce_change,
  on_status: (status) => fitness_events.emit(BrowserWindow.getAllWindows(), "sync_status", status),
});

// ── Window ───────────────────────────────────────────────────────────────────

const page = {
  dev_url: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  file: join(import.meta.dirname, "../renderer/index.html"),
};

function open_window(): BrowserWindow {
  return create_window(BrowserWindow, {
    ...page,
    title: "X-Fitness",
    // electron-vite emits an ESM preload as .mjs; loading .js here silently yields no bridge.
    preload: join(import.meta.dirname, "../preload/index.mjs"),
    default_size: { width: 1100, height: 760 },
    min_size: { width: 360, height: 480 },
    native_theme: nativeTheme,
    shell,
    screen,
    state_file: join(profile, "window.json"),
  });
}

// ── Start ────────────────────────────────────────────────────────────────────

// Only the app's own page may call in, never a site a link led to.
function trusted(event: IpcMainEventLike): boolean {
  return is_app_page(event.senderFrame?.url ?? "", page);
}

function show_existing_window(): void {
  const [window] = BrowserWindow.getAllWindows();
  if (window) bring_to_front(window);
}

if (hold_single_instance(app, show_existing_window)) {
  void app.whenReady().then(() => {
    fitness_bridge.handle(ipcMain, bind_methods(() => database, announce_change), { trusted, envelopes: true });
    device_bridge.handle(
      ipcMain,
      {
        ...sync_device_methods(sync),
        list_backups: kept.list,
        create_backup: () => kept.create(),
        // The restored data no longer matches the server's, so sync waits until the user picks which copy wins.
        restore_backup: async (name) => {
          sync.disconnect();
          await kept.restore(name);
          announce_change();
        },
        remove_backup: kept.remove,
        get_backup_schedule: read_backup_schedule,
        set_backup_schedule: (schedule) => {
          writeFileSync(schedule_file, JSON.stringify(read_schedule(schedule), null, 2));
          void backing_up.check();
        },
      },
      { trusted, envelopes: true },
    );
    open_window();
    sync.start();
  });

  app.on("window-all-closed", () => {
    sync.stop();
    backing_up.stop();
    database.close();
    app.quit();
  });
}
