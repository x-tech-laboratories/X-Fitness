// The schedule: no tables of its own, only what comes next, read from the diet's meals and diary and the workouts'
// followed program, its training days and the log.

// ── Imports ──────────────────────────────────────────────────────────────────

import { parse_local } from "@x-tech-laboratories/x-libs/dates";
import { asc, desc, eq, inArray } from "@x-tech-laboratories/x-libs/drizzle";
import { read_stored_settings, settings_of } from "@x-tech-laboratories/x-libs/settings";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { normalize_meals } from "../diet/model.ts";
import { diet_setting_defaults } from "../diet/settings.ts";
import { diet_feature } from "../diet/store.ts";
import { define_feature, drizzle_of } from "../feature.ts";
import { program_sessions, workouts } from "../workouts/schema.ts";
import { workout_setting_defaults } from "../workouts/settings.ts";
import { schedule_api } from "./api.ts";
import { meal_actions, sort_actions, workout_action, type NextAction, type ScheduledSession, type TrainingSchedule } from "./model.ts";
import { schedule_setting_defaults } from "./settings.ts";

// ── Reading ──────────────────────────────────────────────────────────────────

export function read_schedule(settings: Record<string, unknown>): TrainingSchedule {
  const raw = (settings["workouts.schedule"] ?? workout_setting_defaults["workouts.schedule"]) as Partial<TrainingSchedule>;
  return { program: String(raw.program ?? ""), rule: String(raw.rule ?? ""), start: String(raw.start ?? "") };
}

// The followed program's sessions in order and the last workout logged from one of them.
export function followed_sessions(database: SqlDatabase, schedule: TrainingSchedule): { sessions: ScheduledSession[]; last: { session_id: string; date: string } } {
  if (!schedule.program) return { sessions: [], last: { session_id: "", date: "" } };
  const db = drizzle_of(database);
  const sessions = db
    .select({ id: program_sessions.id, name: program_sessions.name })
    .from(program_sessions)
    .where(eq(program_sessions.program_id, schedule.program))
    .orderBy(asc(program_sessions.position))
    .all();
  if (sessions.length === 0) return { sessions, last: { session_id: "", date: "" } };
  const last = db
    .select({ session_id: workouts.session_id, date: workouts.date })
    .from(workouts)
    .where(inArray(workouts.session_id, sessions.map((session) => session.id)))
    .orderBy(desc(workouts.date), desc(workouts.started_at))
    .get();
  return { sessions, last: last ?? { session_id: "", date: "" } };
}

function training_action(database: SqlDatabase, schedule: TrainingSchedule, now: Date): NextAction | null {
  if (!schedule.program || !schedule.rule) return null;
  const { sessions, last } = followed_sessions(database, schedule);
  if (sessions.length === 0) return null;
  return workout_action(schedule, sessions, last, now);
}

// ── Store ────────────────────────────────────────────────────────────────────

export const schedule_feature = define_feature({
  id: "schedule",
  migrations: [],
  tables: [],
  methods: {
    list_next_actions: (database: SqlDatabase, now: string): NextAction[] => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(now)) throw new Error("Give now as a local time such as 2026-11-10T12:30.");
      const moment = parse_local(now);
      const settings = read_stored_settings(database);
      const meals = normalize_meals(settings["diet.meals"] ?? diet_setting_defaults["diet.meals"]);
      const eaten = new Set(diet_feature.methods.get_diary_day(database, now.slice(0, 10)).entries.map((entry) => entry.meal));
      const training = training_action(database, read_schedule(settings), moment);
      return sort_actions([...meal_actions(meals, eaten, moment), ...(training ? [training] : [])]);
    },
  },
  api: schedule_api,
  settings: settings_of(schedule_setting_defaults),
});
