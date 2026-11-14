// The calculators' settings and their defaults: how active the day is, the basal rate's formula, and the diet plan.
// Plain data, so anything may import it.

// ── Defaults ─────────────────────────────────────────────────────────────────

export const calculators_setting_defaults = {
  "calculators.activity": "light",
  "calculators.bmr_formula": "mifflin_st_jeor",
  // The plan: the weekly change is in kg, below 0 to lose; the body goals are the metrics' own.
  "calculators.weekly_change": 0,
  "calculators.protein_per_kg": 1.6,
  "calculators.fat_percent": 30,
  // Whether the diet's targets follow the plan after every change.
  "calculators.follow_diet_targets": false,
  // "formula" or "measured": whether the diet targets start from the formulas or from the diary and the weight trend.
  "calculators.energy_source": "formula",
  // The days back the diary and the weight trend are read over.
  "calculators.measured_days": 28,
  // The exercises strength scores and runs are read from, by id; "" guesses from the names.
  "calculators.squat_exercise": "",
  "calculators.bench_exercise": "",
  "calculators.deadlift_exercise": "",
  "calculators.running_exercise": "",
  // The METs each kind of exercise burns at; runs go by their pace.
  "calculators.met_weight": 5,
  "calculators.met_bodyweight": 3.8,
  "calculators.met_duration": 4,
  "calculators.met_cardio": 7,
  // Whether the diary adds a day's workout energy to its calorie target.
  "calculators.eat_back_workouts": false,
  // In kg; 0 and an empty list follow the mass unit, 20 kg or 45 lb.
  "calculators.bar_weight": 0,
  "calculators.plates": [] as number[],
};

export type CalculatorsSettingKey = keyof typeof calculators_setting_defaults;
