// Settings every device shares, such as the units shown, kept as JSON values by key in the X-Libs settings store, each
// feature declaring its own keys.

// ── Imports ──────────────────────────────────────────────────────────────────

import { create_settings_store, settings_of, type SettingSpec } from "@x-tech-laboratories/x-libs/settings";

import { define_feature } from "./feature.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

export type { Settings } from "@x-tech-laboratories/x-libs/settings";

export const common_setting_defaults = {
  mass_unit: "kg",
  length_unit: "cm",
  distance_unit: "km",
  energy_unit: "kcal",
  // The day a week starts on, 0 for Sunday and 1 for Monday.
  week_start: 1,
};

// ── Store ────────────────────────────────────────────────────────────────────

// The settings feature over every other feature's settings, so they share one table and one set of calls.
export function create_settings_feature(features: readonly { settings?: Record<string, SettingSpec> }[]) {
  const store = create_settings_store([settings_of(common_setting_defaults), ...features.map((feature) => feature.settings ?? {})], {
    app: { id: "x-fitness", name: "X-Fitness" },
    // A target set by hand for any nutrient, such as diet.target_protein.
    knows: (key) => key.startsWith("diet.target_"),
    descriptions: {
      get_settings:
        "Every setting by key, such as mass_unit or workouts.default_rest, the ones never set at their defaults. diet.label (us, eu, ca, anz or all) picks the nutrients shown and diet.targets (us, eu, ca or anz) the reference amounts each day's targets start from; diet.target_<nutrient>, such as diet.target_protein, is a target set by hand, in kcal or grams, that a null or missing value leaves to the preset. schedule.remind_meals and schedule.remind_training turn the desktop and Android apps' reminders of meals and training days on or off, and schedule.training_day_time (HH:MM) is when a training day without a time is reminded of.",
    },
    key_example: "mass_unit",
  });
  const feature = define_feature({ id: store.id, migrations: store.migrations, tables: store.tables, methods: { ...store.methods }, api: store.api });
  return { store, feature };
}
