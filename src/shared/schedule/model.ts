// What comes next: each timed meal at its start every day, and the followed program's next session on its training
// days, each due, overdue while missed, or moved on once done.

// ── Imports ──────────────────────────────────────────────────────────────────

import { add_days, format_local, parse_local, shift_day, start_of_day } from "@x-tech-laboratories/x-libs/dates";
import { next_from_now, next_occurrence, read_recurrence } from "@x-tech-laboratories/x-libs/recurrence";

import type { Meal } from "../diet/model.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NextAction {
  kind: "meal" | "workout";
  // The meal's or the program session's id.
  id: string;
  // What to do, such as "Eat Lunch" or "Do Pull".
  title: string;
  // A local "YYYY-MM-DDTHH:MM", or a bare day for training days without a time.
  due: string;
  // Due and not done; it stays until the next of its kind comes due.
  overdue: boolean;
}

// The program followed, the iCalendar rule its training days come round on, and the day that rule counts from.
export interface TrainingSchedule {
  program: string;
  rule: string;
  start: string;
}

export interface ScheduledSession {
  id: string;
  name: string;
}

// ── Meals ────────────────────────────────────────────────────────────────────

// Each timed meal at its start: today's while it is to come, overdue until the next meal starts if nothing was eaten in
// it, and tomorrow's once eaten or past.
export function meal_actions(meals: Meal[], eaten: ReadonlySet<string>, now: Date): NextAction[] {
  const timed = meals.filter((meal) => meal.start).sort((first, second) => first.start.localeCompare(second.start));
  const day = format_local(now, false);
  const time = format_local(now, true).slice(11);
  return timed.map((meal, index) => {
    const ends = timed[index + 1]?.start ?? "24:00";
    const action = (on: string, overdue: boolean): NextAction => ({ kind: "meal", id: meal.id, title: `Eat ${meal.name}`, due: `${on}T${meal.start}`, overdue });
    if (eaten.has(meal.id) || time >= ends) return action(shift_day(day, 1), false);
    return action(day, time >= meal.start);
  });
}

// ── Workouts ─────────────────────────────────────────────────────────────────

// Enough for a daily rule followed for years; a rule that runs on past it is cut short rather than slowing the page.
const most_occurrences = 5000;

// The session after the last one done, round to the first again, or the first when none was done.
export function next_session(sessions: ScheduledSession[], last_session_id: string): ScheduledSession | null {
  if (sessions.length === 0) return null;
  return sessions[(sessions.findIndex((session) => session.id === last_session_id) + 1) % sessions.length]!;
}

// A rule without an hour of the day gives training days, due all day.
function is_all_day(rule: string): boolean {
  return !read_recurrence(rule).rule?.byhour?.length;
}

// The rule's occurrences from its start day on, in order, each counted from the one before so an interval keeps its step.
function* occurrences(rule: string, start: string): Generator<Date> {
  let next = next_from_now(rule, "floating", parse_local(start));
  let carried = rule;
  for (let count = 0; next && count < most_occurrences; count += 1) {
    yield next;
    const after = next_occurrence(carried, next, "floating");
    carried = after?.rule ?? carried;
    next = after?.next_date ?? null;
  }
}

// The next session on the schedule: the training day just come due while it is not trained, else the first one to come
// that has not been trained on; null without a rule, sessions or occurrences to come.
export function workout_action(schedule: TrainingSchedule, sessions: ScheduledSession[], last: { session_id: string; date: string }, now: Date): NextAction | null {
  const session = next_session(sessions, last.session_id);
  if (!session || !schedule.rule) return null;
  const all_day = is_all_day(schedule.rule);
  const start = schedule.start || format_local(add_days(start_of_day(now), -28), false);
  const today = format_local(now, false);
  const came_due = (occurrence: Date) => (all_day ? start_of_day(occurrence) : occurrence) <= now;
  const trained_since = (occurrence: Date) => last.date >= format_local(occurrence, false);
  const action = (occurrence: Date, overdue: boolean): NextAction => ({
    kind: "workout",
    id: session.id,
    title: `Do ${session.name}`,
    due: format_local(occurrence, !all_day),
    overdue,
  });

  let latest: Date | null = null;
  try {
    for (const occurrence of occurrences(schedule.rule, start)) {
      if (came_due(occurrence)) {
        latest = occurrence;
        continue;
      }
      if (latest && !trained_since(latest)) break;
      if (!trained_since(occurrence)) return action(occurrence, false);
    }
  } catch {
    return null;
  }
  if (latest && !trained_since(latest)) return action(latest, !all_day || format_local(latest, false) < today);
  return null;
}

// Missed ones first, then the soonest.
export function sort_actions(actions: NextAction[]): NextAction[] {
  return actions.toSorted((first, second) => Number(second.overdue) - Number(first.overdue) || first.due.localeCompare(second.due));
}
