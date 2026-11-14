// The calculator calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { day } from "../api_schemas.ts";

// ── Calls ────────────────────────────────────────────────────────────────────

export const calculators_api = {
  get_calculations: {
    description:
      "Works out BMI, body fat by the US Navy tape and Jackson-Pollock caliper methods, lean and fat mass, FFMI, waist ratios, basal metabolic rate and daily energy burned from the latest body readings on or before a day and the sex, height, birth date and activity in Settings. Also gives the goals the plan in Settings (calculators.goal_body_fat, goal_bmi, goal_waist_to_height, weekly_change in kg, protein_per_kg, fat_percent) leads to, beside the goals and diet targets set now. In kg, cm, percent, kcal and grams.",
    params: [{ name: "today", schema: day }],
  },
  apply_calculated_goals: {
    description:
      "Sets the goals named to what get_calculations gives: weight, body_fat and waist become the goals of the matching body metrics, calories, protein, fat and carbs the diet's daily targets. Goals without the measures they need are left alone. Gives back how many changed.",
    params: [
      {
        name: "keys",
        schema: { type: "array", items: { type: "string", enum: ["weight", "body_fat", "waist", "calories", "protein", "fat", "carbs"] }, description: "The goals to set." },
      },
      { name: "today", schema: day },
    ],
  },
} satisfies Record<string, MethodSpec>;
