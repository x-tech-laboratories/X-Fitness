// The diet's settings and their defaults: the nutrition label and target presets, the meals, the USDA key for the online lookup, and
// the grocery list's choices. A target set by hand is "diet.target_<nutrient>", with no default, since a nutrient without
// one follows the target preset. Plain data, so anything may import it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { default_meals } from "./model.ts";

// ── Defaults ─────────────────────────────────────────────────────────────────

export const diet_setting_defaults = {
  // Which label's nutrients the page shows, from labels.ts, and the ones switched on or off by hand.
  "diet.label": "us",
  "diet.shown": {} as Record<string, boolean>,
  // Which region's reference amounts the day's targets start from.
  "diet.targets": "us",
  // The day's meals in order, each with the time it starts and its share of the energy target.
  "diet.meals": default_meals,
  "diet.usda_api_key": "",
  "diet.prefill_grocery_comment": false,
};

export type DietSettingKey = keyof typeof diet_setting_defaults;
