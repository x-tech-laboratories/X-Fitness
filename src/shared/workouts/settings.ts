// The workouts settings with their defaults, kept apart from the store so the page reads them without pulling it in.

// ── Defaults ─────────────────────────────────────────────────────────────────

export const workout_setting_defaults = {
  // Seconds of rest a new session exercise starts with, and the rest timer's for an exercise added mid-workout.
  "workouts.default_rest": 90,
  "workouts.rest_sound": true,
  "workouts.weekly_target": 3,
  // The program followed, the iCalendar rule its sessions come round on in turn, and the day that rule counts from.
  "workouts.schedule": { program: "", rule: "", start: "" },
};
