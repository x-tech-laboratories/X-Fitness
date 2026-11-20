// Reminders of the next actions: each timed meal as it starts and each training day's session as it comes due, shown by
// the desktop daemon whether its window is open or not, and handed to a phone ahead of time.

// ── Imports ──────────────────────────────────────────────────────────────────

import { add_days, format_local, has_time, parse_local, start_of_day } from "@x-tech-laboratories/x-libs/dates";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { app_link } from "../links.ts";
import { settings_feature } from "../settings.ts";
import { normalize_meals } from "../diet/model.ts";
import { diet_setting_defaults } from "../diet/settings.ts";
import { diet_feature } from "../diet/store.ts";
import { upcoming_sessions, type NextAction } from "./model.ts";
import { schedule_setting_defaults } from "./settings.ts";
import { followed_sessions, read_schedule, schedule_feature } from "./store.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface Reminder {
  // The same action on the same day always has the same key, so a notice is never shown twice on screen.
  key: string;
  title: string;
  body: string;
  // Opens the app on the page to log it.
  url: string;
}

export interface ReminderSettings {
  remind_meals: boolean;
  remind_training: boolean;
  training_day_time: string;
}

// ── Reading ──────────────────────────────────────────────────────────────────

export function reminder_settings(settings: Record<string, unknown>): ReminderSettings {
  const value = <Key extends keyof typeof schedule_setting_defaults>(key: Key) => settings[key] ?? schedule_setting_defaults[key];
  const time = String(value("schedule.training_day_time"));
  return {
    remind_meals: value("schedule.remind_meals") === true,
    remind_training: value("schedule.remind_training") === true,
    training_day_time: /^\d{2}:\d{2}$/.test(time) ? time : schedule_setting_defaults["schedule.training_day_time"],
  };
}

// The moment an action is reminded of: its own time, or the training day's time for a day without one.
export function reminder_moment(action: NextAction, settings: ReminderSettings): Date {
  return parse_local(has_time(action.due) ? action.due : `${action.due}T${settings.training_day_time}`);
}

function reminder_of(action: NextAction): Reminder {
  const time = has_time(action.due) ? action.due.slice(11) : "";
  if (action.kind === "meal") {
    return { key: `meal-${action.id}-${action.due}`, title: action.title, body: `Starts at ${time}. Log what you eat in the diary.`, url: app_link("#/diet/diary") };
  }
  const body = time ? `Today's session, at ${time}.` : "Today's session.";
  return { key: `workout-${action.id}-${action.due}`, title: action.title, body, url: app_link("#/workouts/log") };
}

// ── Reminders ────────────────────────────────────────────────────────────────

// What fell due after one moment and up to another: the next actions at either moment, each turned on in the settings,
// whose reminder falls in between. Both are read, since a missed session hides the next until that one comes due, and a
// meal already eaten has moved on to tomorrow, so it is left out.
export function due_reminders(database: SqlDatabase, after: Date, until: Date): Reminder[] {
  const settings = reminder_settings(settings_feature.methods.get_settings(database));
  if (!settings.remind_meals && !settings.remind_training) return [];
  const next_at = (moment: Date) => schedule_feature.methods.list_next_actions(database, format_local(moment, true));
  const reminders = [...next_at(after), ...next_at(until)]
    .filter((action) => (action.kind === "meal" ? settings.remind_meals : settings.remind_training))
    .filter((action) => {
      const moment = reminder_moment(action, settings).getTime();
      return moment > after.getTime() && moment <= until.getTime();
    })
    .map(reminder_of);
  return reminders.filter((reminder, index) => reminders.findIndex((other) => other.key === reminder.key) === index);
}

// Every reminder from one moment up to another, such as the next two weeks a phone is handed: each timed meal on each
// day, but for one already eaten, and the training days' sessions in turn as if each is trained.
export function reminders_between(database: SqlDatabase, after: Date, until: Date): (Reminder & { at: number })[] {
  const all_settings = settings_feature.methods.get_settings(database);
  const settings = reminder_settings(all_settings);
  const found: (Reminder & { at: number })[] = [];
  if (settings.remind_meals) {
    const meals = normalize_meals(all_settings["diet.meals"] ?? diet_setting_defaults["diet.meals"]).filter((meal) => meal.start);
    for (let day = start_of_day(after); day <= until; day = add_days(day, 1)) {
      const date = format_local(day, false);
      const eaten = new Set(diet_feature.methods.get_diary_day(database, date).entries.map((entry) => entry.meal));
      for (const meal of meals.filter((meal) => !eaten.has(meal.id))) {
        const action: NextAction = { kind: "meal", id: meal.id, title: `Eat ${meal.name}`, due: `${date}T${meal.start}`, overdue: false };
        const at = parse_local(action.due);
        if (at > after && at <= until) found.push({ ...reminder_of(action), at: at.getTime() });
      }
    }
  }
  if (settings.remind_training) {
    const schedule = read_schedule(all_settings);
    const { sessions, last } = followed_sessions(database, schedule);
    for (const { action, at } of upcoming_sessions(schedule, sessions, last, after, until, settings.training_day_time)) found.push({ ...reminder_of(action), at: at.getTime() });
  }
  return found.sort((first, second) => first.at - second.at);
}
