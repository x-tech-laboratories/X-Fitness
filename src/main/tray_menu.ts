// What the tray shows, worked out apart from Electron: the workout under way with its time, what comes next, and the
// window and quit commands.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_clock } from "@x-tech-laboratories/x-libs/durations";
import { shift_day } from "@x-tech-laboratories/x-libs/dates";
import { app_rows, tray_groups, type TrayRow, type TrayView } from "@x-tech-laboratories/x-libs/electron/tray";

import type { NextAction } from "../shared/schedule/model.ts";
import type { Workout } from "../shared/workouts/model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

// A workout started and not yet finished, as the tray shows it.
export interface TrayWorkout {
  id: string;
  name: string;
  seconds: number;
}

export interface TrayState {
  workouts: TrayWorkout[];
  next: NextAction[];
  // The local day, such as "2026-11-19".
  today: string;
}

// What the tray's rows do.
export interface TrayActions {
  open_route: (route: string) => void;
  finish_workout: (workout_id: string) => unknown;
  show: () => void;
  quit: () => void;
  quit_completely: () => void;
}

// How many of the next actions the menu lists.
const most_next = 3;

// ── Reading ──────────────────────────────────────────────────────────────────

// Today's workouts that were started and not finished, with how long each has run.
export function running_workouts(workouts: Workout[], now: Date): TrayWorkout[] {
  return workouts
    .filter((workout) => workout.started_at && !workout.finished_at)
    .map((workout) => ({ id: workout.id, name: workout.name || "Workout", seconds: Math.max(0, Math.floor((now.getTime() - Date.parse(workout.started_at)) / 1000)) }));
}

// ── Labels ───────────────────────────────────────────────────────────────────

function workout_label(workout: TrayWorkout): string {
  return `${workout.name} — ${format_clock(workout.seconds * 1000)}`;
}

// When an action is due, said as briefly as the menu allows: "missed", "12:30", "tomorrow 12:30" or a day.
export function due_label(action: NextAction, today: string): string {
  if (action.overdue) return "missed";
  const [day = "", time = ""] = action.due.split("T");
  const on = day === today ? "" : day === shift_day(today, 1) ? "tomorrow" : day;
  return [on, time].filter(Boolean).join(" ") || "today";
}

// ── Menu ─────────────────────────────────────────────────────────────────────

// Each running workout with Finish, the next few actions, then showing the window, quitting the window and tray, and
// quitting the daemon too; the tooltip names the running workouts and their times.
export function tray_view(state: TrayState, actions: TrayActions): TrayView {
  const workout_rows = state.workouts.flatMap((workout): TrayRow[] => [
    { kind: "item", label: workout_label(workout), run: () => actions.open_route("#/workouts/log") },
    { kind: "item", label: state.workouts.length === 1 ? "Finish workout" : `Finish ${workout.name}`, run: () => actions.finish_workout(workout.id) },
  ]);
  const next_rows = state.next
    .slice(0, most_next)
    .map((action): TrayRow => ({ kind: "item", label: `${action.title} — ${due_label(action, state.today)}`, run: () => actions.open_route("#/overview") }));
  return {
    tooltip: ["X-Fitness", ...state.workouts.map(workout_label)].join("\n"),
    rows: tray_groups(workout_rows, next_rows, app_rows({ app_name: "X-Fitness", show: actions.show, quit: actions.quit, quit_completely: actions.quit_completely })),
  };
}
