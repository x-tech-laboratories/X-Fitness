// The calculators' settings and their defaults: how active the day is, the basal rate's formula, and the goal plan.
// Plain data, so anything may import it.

// ── Defaults ─────────────────────────────────────────────────────────────────

export const calculators_setting_defaults = {
  "calculators.activity": "light",
  "calculators.bmr_formula": "mifflin_st_jeor",
  // The plan: 0 leaves a target out; the weekly change is in kg, below 0 to lose.
  "calculators.goal_body_fat": 0,
  "calculators.goal_bmi": 22,
  "calculators.goal_waist_to_height": 0.5,
  "calculators.weekly_change": 0,
  "calculators.protein_per_kg": 1.6,
  "calculators.fat_percent": 30,
  // Whether the body goals and the diet's targets follow the plan after every change.
  "calculators.follow_body_goals": false,
  "calculators.follow_diet_targets": false,
};

export type CalculatorsSettingKey = keyof typeof calculators_setting_defaults;
