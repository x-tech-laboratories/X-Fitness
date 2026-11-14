// The diet's settings and their defaults: the nutrition label and target presets, the USDA key for the online lookup, and
// the grocery list's choices. A target set by hand is "diet.target_<nutrient>", with no default, since a nutrient without
// one follows the target preset. Plain data, so anything may import it.

// ── Defaults ─────────────────────────────────────────────────────────────────

export const diet_setting_defaults = {
  // Which label's nutrients the page shows, from labels.ts, and the ones switched on or off by hand.
  "diet.label": "us",
  "diet.shown": {} as Record<string, boolean>,
  // Which region's reference amounts the day's targets start from.
  "diet.targets": "us",
  "diet.usda_api_key": "",
  "diet.prefill_grocery_comment": false,
};

export type DietSettingKey = keyof typeof diet_setting_defaults;
