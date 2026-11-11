// The body settings and their defaults, apart from the store so the page can read them without loading it.

export const body_setting_defaults = {
  // In cm; above 0 it turns on BMI.
  "body.height": 0,
  // "female", "male", or "" to mix the two in the 3D body.
  "body.sex": "",
  // The colour and opacity of each body on the 3D tab: now, at the goals, and on the day it is compared with.
  "body.shape_looks": {
    now: { color: "#2563eb", opacity: 0.6 },
    goal: { color: "#f59e0b", opacity: 0.6 },
    day: { color: "#16a34a", opacity: 0.6 },
  },
};
