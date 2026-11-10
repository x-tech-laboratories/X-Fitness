// The diet's settings and their defaults: the day's targets, the USDA key for the online lookup, and the grocery list's
// choices. Plain data, so anything may import it.

// ── Defaults ─────────────────────────────────────────────────────────────────

export const diet_setting_defaults = {
  "diet.target_calories": 2000,
  "diet.target_protein": 100,
  "diet.target_carbs": 250,
  "diet.target_fat": 65,
  "diet.target_fiber": 30,
  "diet.target_sugar": 50,
  "diet.target_saturated_fat": 20,
  "diet.target_sodium": 2.3,
  "diet.target_cholesterol": 0.3,
  "diet.usda_api_key": "",
  "diet.prefill_grocery_comment": false,
};

export type DietSettingKey = keyof typeof diet_setting_defaults;
