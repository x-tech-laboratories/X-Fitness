// The desktop app's window: Electron's main process, which shows X-Fitness, keeps its tray icon and its login entry, and
// leaves the work to the daemon in src/daemon, reached over a Unix socket.

// ── Imports ──────────────────────────────────────────────────────────────────

import { join } from "node:path";

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from "electron";
import { launch_command, set_autostart } from "@x-tech-laboratories/x-libs/autostart";
import { format_local } from "@x-tech-laboratories/x-libs/dates";
import { bring_to_front, hold_single_instance } from "@x-tech-laboratories/x-libs/electron/app";
import type { Implementation, IpcMainEventLike } from "@x-tech-laboratories/x-libs/electron/bridge";
import { create_app_tray } from "@x-tech-laboratories/x-libs/electron/tray";
import { create_window, is_app_page } from "@x-tech-laboratories/x-libs/electron/window";
import { call_daemon, daemon_log_path, daemon_socket_path, follow_daemon_events, start_daemon } from "@x-tech-laboratories/x-libs/local_daemon";
import { certificate_method_names } from "@x-tech-laboratories/x-libs/certificate_protocol";
import { local_mcp_method_names } from "@x-tech-laboratories/x-libs/local_mcp_protocol";

import { certificate_bridge, desktop_bridge, device_bridge, fitness_bridge, fitness_events, local_mcp_bridge } from "../shared/bridge.ts";
import type { DesktopMethods, DesktopSettings } from "../shared/desktop.ts";
import { device_method_names, is_read_only } from "../shared/page_api.ts";
import type { NextAction } from "../shared/schedule/model.ts";
import { method_names } from "../shared/store.ts";
import type { Workout } from "../shared/workouts/model.ts";
import { running_workouts, tray_view, type TrayState } from "./tray_menu.ts";

// ── Profile ──────────────────────────────────────────────────────────────────

// Dev runs set this so they never touch the installed app's data.
const is_own_profile = process.env.X_FITNESS_USER_DATA === undefined;
if (!is_own_profile) app.setPath("userData", join(process.cwd(), process.env.X_FITNESS_USER_DATA!));

const profile = app.getPath("userData");
const database_path = join(profile, "fitness.db");

// Any other profile gets a daemon, socket and log of its own, so a dev or test run never reaches the user's daemon.
const socket_path = daemon_socket_path({ app: "x-fitness", data_file: is_own_profile ? null : database_path });
const log_file = is_own_profile ? daemon_log_path("x-fitness") : join(profile, "daemon.log");

// The built app sits in out/main, and resources/ beside out/ both in the source tree and in the package.
const icon_path = join(import.meta.dirname, "../../resources/icon.png");

// The command that starts this app again, which the login entry runs.
const own_command = (args: string[]): string[] =>
  launch_command({ launcher: process.env.X_FITNESS_LAUNCHER, is_packaged: app.isPackaged, app_path: app.getAppPath(), args });

// ── Daemon ───────────────────────────────────────────────────────────────────

function ensure_daemon(): Promise<unknown> {
  return start_daemon({
    socket_path,
    script: join(import.meta.dirname, "daemon.js"),
    env: { X_FITNESS_DB: database_path, X_FITNESS_SOCKET: socket_path, X_FITNESS_VERSION: app.getVersion() },
    log_file,
  });
}

// Given by the daemon when this process connects, so the window is not told about its own changes.
let client_id = "";

// One call to the daemon, as the page made it; a change also shows in the tray at once.
async function call(path: string, args: unknown[]): Promise<unknown> {
  const result = await call_daemon(socket_path, `/api/${path}`, args, { "x-client-id": client_id });
  if (!is_read_only(path.slice(path.lastIndexOf("/") + 1))) void tray.refresh();
  return result;
}

// Every call in a table, passed on to the daemon under a path of its own.
function forwarded(names: readonly string[], prefix: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => call(`${prefix}/${name}`, args)]));
}

function get_desktop_settings(): Promise<DesktopSettings> {
  return call("daemon/get_desktop_settings", []) as Promise<DesktopSettings>;
}

// Settings the window itself acts on: the tray and starting at login.
async function apply_window_settings(): Promise<void> {
  const settings = await get_desktop_settings();
  tray.set_shown(settings.show_tray_icon);
  apply_autostart(settings);
}

// Only the user's own profile starts at login; a dev run never writes the login entry.
function apply_autostart(settings: DesktopSettings): void {
  if (!is_own_profile) return;
  set_autostart(
    { id: "x-fitness-daemon", name: "X-Fitness in the background", comment: "Sync and backups for X-Fitness", icon: icon_path, command: own_command(["--daemon"]) },
    settings.start_at_login && settings.keep_running_in_background,
  );
}

// Every window hears of the daemon's changes, and comes back to a daemon that stopped, such as one quit from the tray.
let is_quitting = false;
let stop_following = (): void => {};

function follow_daemon(): void {
  stop_following = follow_daemon_events(
    socket_path,
    "/api/events",
    (event, data) => {
      if (event === "hello") client_id = data;
      if (event === "changed") announce_change();
      if (event === "sync_status") fitness_events.emit(BrowserWindow.getAllWindows(), "sync_status", JSON.parse(data));
    },
    {
      // A reconnect may have missed changes, so the windows fetch again.
      on_connect: announce_change,
      on_disconnect: () => {
        if (!is_quitting) void ensure_daemon().catch((error: unknown) => console.error(error));
      },
    },
  );
}

function announce_change(): void {
  fitness_events.emit(BrowserWindow.getAllWindows(), "changed", null);
  void apply_window_settings().catch(() => undefined);
  void tray.refresh();
}

// ── Window ───────────────────────────────────────────────────────────────────

const page = {
  dev_url: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  file: join(import.meta.dirname, "../renderer/index.html"),
};

function open_window(): BrowserWindow {
  return create_window(BrowserWindow, {
    ...page,
    title: "X-Fitness",
    icon: icon_path,
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

// Brings the window forward, making one if it was closed, and hands it the route once its page listens.
function show_window(route?: string): void {
  const existing = BrowserWindow.getAllWindows()[0];
  const window = existing ?? open_window();
  bring_to_front(window);
  if (!route) return;
  if (existing) fitness_events.emit([window], "open", route);
  else window.webContents.once("did-finish-load", () => fitness_events.emit([window], "open", route));
}

// Stops the daemon as well, so nothing runs until the app is opened again.
async function quit_completely(): Promise<void> {
  is_quitting = true;
  await call("daemon/stop_daemon", []).catch(() => undefined);
  app.quit();
}

// ── Tray icon ────────────────────────────────────────────────────────────────

async function read_tray_state(): Promise<TrayState> {
  const now = new Date();
  const today = format_local(now, false);
  const [workouts, next] = (await Promise.all([call("call/list_workouts", [today]), call("call/list_next_actions", [format_local(now, true)])])) as [Workout[], NextAction[]];
  return { workouts: running_workouts(workouts, now), next, today };
}

// The tray brings the window forward, making one again if it was closed, and opens the page where a row points.
// Its own calls go with this process's client id, and the page hears of them as a change from elsewhere.
const tray = create_app_tray({
  electron: { Tray, Menu, nativeImage },
  icon_path,
  on_click: () => show_window(),
  on_error: (error) => console.error(error),
  read: async () =>
    tray_view(await read_tray_state(), {
      open_route: (route) => show_window(route),
      finish_workout: (workout_id) => call("call/finish_workout", [workout_id, new Date().toISOString()]).then(announce_change),
      show: () => show_window(),
      quit: () => {
        is_quitting = true;
        app.quit();
      },
      quit_completely: () => void quit_completely(),
    }),
});

// ── Bridges ──────────────────────────────────────────────────────────────────

// Only the app's own page may call in, never a site a link led to.
function trusted(event: IpcMainEventLike): boolean {
  return is_app_page(event.senderFrame?.url ?? "", page);
}

// The page's calls go to the daemon, but for quitting and the settings the window acts on.
function register_bridges(): void {
  const options = { trusted, envelopes: true };
  fitness_bridge.handle(ipcMain, forwarded(method_names, "call") as never, options);
  device_bridge.handle(ipcMain, forwarded(device_method_names, "device") as never, options);
  certificate_bridge.handle(ipcMain, forwarded(certificate_method_names, "certificates") as never, options);
  local_mcp_bridge.handle(ipcMain, forwarded(local_mcp_method_names, "local_mcp") as never, options);
  const desktop: Implementation<DesktopMethods> = {
    get_desktop_settings,
    set_desktop_setting: async (key, value) => {
      await call("daemon/set_desktop_setting", [key, value]);
      await apply_window_settings();
    },
    quit_completely,
  };
  desktop_bridge.handle(ipcMain, desktop, options);
}

// ── Start ────────────────────────────────────────────────────────────────────

function start_app(): void {
  void app.whenReady().then(async () => {
    try {
      await ensure_daemon();
    } catch (error) {
      dialog.showErrorBox("X-Fitness could not start", `${error instanceof Error ? error.message : String(error)}\n\nSee ${log_file}.`);
      app.exit(1);
      return;
    }
    register_bridges();
    follow_daemon();
    await apply_window_settings().catch(() => undefined);
    open_window();
  });

  app.on("will-quit", () => {
    is_quitting = true;
    stop_following();
    tray.stop();
  });

  // Closing the window ends only the window, or leaves the app in the tray; the daemon runs on either way.
  app.on("window-all-closed", () => {
    if (!tray.is_shown()) app.quit();
  });
}

// `x-fitness-desktop --daemon`, as the login entry runs it, starts only the daemon.
async function start_daemon_alone(): Promise<void> {
  try {
    await ensure_daemon();
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
}

// A second launch brings the window forward, but one that only starts the daemon leaves the window be.
if (process.argv.includes("--daemon")) void start_daemon_alone();
else if (hold_single_instance(app, (argv) => argv.includes("--daemon") || show_window())) start_app();
