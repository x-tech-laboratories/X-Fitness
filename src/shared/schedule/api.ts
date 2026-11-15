// The schedule's calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

// ── Calls ────────────────────────────────────────────────────────────────────

export const schedule_api = {
  list_next_actions: {
    description:
      "What to do next, missed ones first and then the soonest: one row per meal with a start time in the diet.meals setting, due at that start every day, and the next session of the program followed, due on the next training day of the workouts.schedule setting ({ program, rule, start }: the program's id, an iCalendar RRULE such as FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=18;BYMINUTE=0 in local time, and the day it counts from), the sessions taken in turn after the last one logged. A meal is done once anything is logged in it that day, and missed until the next meal starts; a session is done once a workout of the program is logged that day, and missed until the next training day. Each row has kind (meal or workout), the meal's or session's id, a title such as Eat Lunch or Do Pull, due as a local YYYY-MM-DDTHH:MM, or a bare day for a rule without an hour, and overdue.",
    params: [{ name: "now", schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$", description: "The local time now, such as 2026-11-10T12:30." } }],
  },
} satisfies Record<string, MethodSpec>;
