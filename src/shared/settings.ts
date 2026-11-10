// Settings every device shares, such as the units shown, kept as JSON values by key so each feature can add its own.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

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
  setting_defaults: common_setting_defaults,
});
