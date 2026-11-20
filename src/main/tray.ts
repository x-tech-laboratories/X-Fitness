// The tray icon: a workout under way with its time and Finish, what comes next, and bringing the window back.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";

import { tray_items, tray_tooltip, type TrayItem, type TrayState } from "./tray_menu.ts";

// ── Tray ─────────────────────────────────────────────────────────────────────

// What the tray needs from the app: its icon, what to show, and ways to finish a workout, open the page and quit.
export interface TrayHost {
  icon_path: string;
  read_state: () => Promise<TrayState>;
  finish_workout: (workout_id: string) => Promise<void>;
  open_route: (route: string) => void;
  show_window: () => void;
  quit: () => void;
  quit_completely: () => void;
}

// How often the tray reads again, so a workout's time keeps up.
const refresh_ms = 5000;

let tray: Tray | null = null;
let refresh_timer: ReturnType<typeof setInterval> | undefined;

// Shows or takes away the icon, as the setting says.
export function apply_tray_setting(is_shown: boolean, host: TrayHost): void {
  if (is_shown && !tray) start_tray(host);
  if (!is_shown && tray) stop_tray();
}

// While shown, closing the window leaves the app in the tray.
export function is_tray_shown(): boolean {
  return tray !== null;
}

export function stop_tray(): void {
  clearInterval(refresh_timer);
  tray?.destroy();
  tray = null;
}

function start_tray(host: TrayHost): void {
  tray = new Tray(nativeImage.createFromPath(host.icon_path).resize({ width: 22, height: 22 }));
  tray.on("click", host.show_window);
  void refresh_tray(host);
  refresh_timer = setInterval(() => void refresh_tray(host), refresh_ms);
}

// Also run when the data changed, so a workout started in the window shows at once.
export async function refresh_tray(host: TrayHost): Promise<void> {
  if (!tray || tray.isDestroyed()) return;
  const state = await host.read_state().catch((): TrayState => ({ workouts: [], next: [], today: "" }));
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(tray_tooltip(state));
  tray.setContextMenu(Menu.buildFromTemplate(tray_items(state).map((item) => menu_item(item, host))));
}

function menu_item(item: TrayItem, host: TrayHost): MenuItemConstructorOptions {
  switch (item.kind) {
    case "separator":
      return { type: "separator" };
    case "open":
      return { label: item.label, click: () => host.open_route(item.route) };
    case "finish":
      return { label: item.label, click: () => void host.finish_workout(item.workout_id).then(() => refresh_tray(host)) };
    case "command":
      return { label: item.label, click: { show: host.show_window, quit: host.quit, quit_completely: host.quit_completely }[item.command] };
  }
}
