// What the tray shows, worked out apart from Electron: the workout under way with its time, what comes next, and the
// window and quit commands.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_clock } from "@x-tech-laboratories/x-libs/durations";
import { shift_day } from "@x-tech-laboratories/x-libs/dates";

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

// One row of the tray's menu: a link into the page, finishing a workout, a command, or a line between groups.
export type TrayItem =
  | { kind: "open"; label: string; route: string }
  | { kind: "finish"; label: string; workout_id: string }
  | { kind: "command"; label: string; command: "show" | "quit" | "quit_completely" }
  | { kind: "separator" };

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
// quitting the daemon too.
export function tray_items(state: TrayState): TrayItem[] {
  const workout_items = state.workouts.flatMap((workout): TrayItem[] => [
    { kind: "open", label: workout_label(workout), route: "#/workouts/log" },
    { kind: "finish", label: state.workouts.length === 1 ? "Finish workout" : `Finish ${workout.name}`, workout_id: workout.id },
  ]);
  const next_items = state.next.slice(0, most_next).map((action): TrayItem => ({ kind: "open", label: `${action.title} — ${due_label(action, state.today)}`, route: "#/overview" }));
  const groups = [workout_items, next_items].filter((group) => group.length > 0);
  return [
    ...groups.flatMap((group): TrayItem[] => [...group, { kind: "separator" }]),
    { kind: "command", label: "Show X-Fitness", command: "show" },
    { kind: "command", label: "Quit", command: "quit" },
    { kind: "command", label: "Quit completely", command: "quit_completely" },
  ];
}

// The tooltip names the running workouts and their times, or the app alone when none runs.
export function tray_tooltip(state: TrayState): string {
  return ["X-Fitness", ...state.workouts.map(workout_label)].join("\n");
}
