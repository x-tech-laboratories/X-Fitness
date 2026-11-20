// The reminder settings with their defaults, kept apart from the store so the page reads them without pulling it in.

// ── Defaults ─────────────────────────────────────────────────────────────────

export const schedule_setting_defaults = {
  // A notice as each timed meal starts, unless something is already logged in it.
  "schedule.remind_meals": false,
  // A notice as each training day's session comes due.
  "schedule.remind_training": true,
  // When a training day with no time of its own is reminded of.
  "schedule.training_day_time": "08:00",
};
