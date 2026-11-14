// Settings every device shares, such as the units shown, kept as JSON values by key so each feature can add its own.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { text } from "./api_schemas.ts";
import { define_feature } from "./feature.ts";

// ── Settings ─────────────────────────────────────────────────────────────────

export type Settings = Record<string, unknown>;

export const common_setting_defaults = {
  mass_unit: "kg",
  length_unit: "cm",
  distance_unit: "km",
  energy_unit: "kcal",
  // The day a week starts on, 0 for Sunday and 1 for Monday.
  week_start: 1,
} satisfies Settings;

// ── Store ────────────────────────────────────────────────────────────────────

export const settings_feature = define_feature({
  id: "settings",
  migrations: [`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`],
  tables: [{ name: "settings", key_columns: ["key"] }],
  methods: {
    // Only the values set; the page lays them over the defaults.
    get_settings: (database: SqlDatabase): Settings => {
      const rows = database.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
      return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
    },
    set_setting: (database: SqlDatabase, key: string, value: unknown): void => {
      database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
    },
  },
  api: {
    get_settings: {
      description:
        "The settings stored, by key, such as mass_unit or workouts.default_rest; a key missing here has its default. diet.label (us, eu, ca, anz or all) picks the nutrients shown and diet.targets (us, eu, ca or anz) the reference amounts each day's targets start from; diet.target_<nutrient>, such as diet.target_protein, is a target set by hand, in kcal or grams, that a null or missing value leaves to the preset.",
      params: [],
    },
    set_setting: {
      description: "Sets one setting by key to any JSON value.",
      params: [{ name: "key", schema: text("The setting's key, such as mass_unit.") }, { name: "value", schema: { description: "The new value." } }],
    },
  },
  setting_defaults: common_setting_defaults,
});
