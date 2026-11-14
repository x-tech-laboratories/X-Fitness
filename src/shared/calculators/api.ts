// The calculator calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { day } from "../api_schemas.ts";

// ── Calls ────────────────────────────────────────────────────────────────────

export const calculators_api = {
  get_calculations: {
    description:
      "Works out BMI, body fat by the US Navy tape, Jackson-Pollock calipers and from BMI, lean and fat mass, FFMI, waist ratios, basal metabolic rate, daily energy burned and water a day from the latest body readings on or before a day (weight, height, body fat, girths and skinfolds, each from the metric with that role, its goal being the body goal) and the body.sex, body.birth_date and calculators.activity settings. Also the weight trend a week and the energy burned a day as measured from the diary and that trend over calculators.measured_days, the weeks left to the weight metric's goal at the trend's and the plan's pace, and the daily calories, protein, fat and carbs the plan (calculators.weekly_change in kg, protein_per_kg, fat_percent, energy_source) leads to, beside the diet targets in force now. In kg, cm, percent, kcal, litres and grams.",
    params: [{ name: "today", schema: day }],
  },
  get_training_calculations: {
    description:
      "Works out from the last 90 days of workouts: each weighted exercise's best set and its estimated one-rep max (Epley, reps in reserve from the RPE counted), the squat, bench press and deadlift picked in calculators.squat_exercise and the like or guessed from the names with their total and Wilks, DOTS and IPF GoodLift points, heart-rate zones and VO2max from the age and the resting heart rate reading, the best run's VDOT and predicted race times, the energy each workout of the last 30 days burned, and the bar and plates. In kg, km, seconds, bpm and kcal.",
    params: [{ name: "today", schema: day }],
  },
  list_workout_energy: {
    description:
      "The energy each workout between two days burned, from the METs per kind of exercise in Settings (runs by their pace), the time each exercise took and the weight that day. In seconds and kcal.",
    params: [{ name: "from", schema: day }, { name: "to", schema: day }],
  },
  apply_calculated_goals: {
    description:
      "Sets the diet's daily targets named to what get_calculations gives from the plan. Targets without the measures they need are left alone. Gives back how many changed. The body goals are each metric's own goal, set with save_body_metric.",
    params: [
      {
        name: "keys",
        schema: { type: "array", items: { type: "string", enum: ["calories", "protein", "fat", "carbs"] }, description: "The targets to set." },
      },
      { name: "today", schema: day },
    ],
  },
} satisfies Record<string, MethodSpec>;
