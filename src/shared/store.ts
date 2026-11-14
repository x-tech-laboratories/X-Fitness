// The one database every X-Fitness device keeps: every feature's tables brought up to date, sync set to stamp every
// change, and every feature's calls in one table the page reaches through whichever host it runs on.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ApiSpec } from "@x-tech-laboratories/x-libs/api_spec";
import { in_transaction, migrate, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import { create_sync_engine } from "@x-tech-laboratories/x-libs/sync_engine";

import { body_feature } from "./body/store.ts";
import { calculators_feature } from "./calculators/store.ts";
import { diet_feature } from "./diet/store.ts";
import { forget_synced_changes, history_feature, install_history, record_history } from "./history/store.ts";
import { is_read_only } from "./page_api.ts";
import { settings_feature } from "./settings.ts";
import { workouts_feature } from "./workouts/store.ts";

// ── Features ─────────────────────────────────────────────────────────────────

export const features = [settings_feature, workouts_feature, diet_feature, body_feature, calculators_feature, history_feature];

export const sync_engine = create_sync_engine({ tables: features.flatMap((feature) => feature.tables), after_apply: forget_synced_changes });

export const setting_defaults = Object.assign({}, ...features.map((feature) => feature.setting_defaults ?? {})) as Record<string, unknown>;

// ── Opening ──────────────────────────────────────────────────────────────────

// Whether the versions table still names its key column feature, as databases made before X-Libs kept the versions do.
function has_old_versions(database: SqlDatabase): boolean {
  return database.prepare("SELECT 1 FROM pragma_table_info('schema_versions') WHERE name = 'feature'").get() !== undefined;
}

// Each feature's one step from before X-Libs kept the versions, as the count of its steps now; body's became two.
const steps_before_owners: Record<string, number> = { body: 2 };

// The old versions move to an owner column, counted in today's steps, so no step runs twice.
function adopt_old_versions(database: SqlDatabase): void {
  if (!has_old_versions(database)) return;
  in_transaction(database, () => {
    const rows = database.prepare("SELECT feature, version FROM schema_versions").all() as { feature: string; version: number }[];
    database.exec("DROP TABLE schema_versions");
    database.exec("CREATE TABLE schema_versions (owner TEXT PRIMARY KEY, version INTEGER NOT NULL)");
    const insert = database.prepare("INSERT INTO schema_versions (owner, version) VALUES (?, ?)");
    for (const row of rows) insert.run(row.feature, row.version === 1 ? (steps_before_owners[row.feature] ?? 1) : row.version);
  });
}

// Whether opening would change the schema of a database that already holds data, so it can be backed up first.
export function needs_upgrade(database: SqlDatabase): boolean {
  const has_versions = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_versions'").get() !== undefined;
  if (!has_versions) return false;
  if (has_old_versions(database)) return true;
  const version_of = database.prepare("SELECT version FROM schema_versions WHERE owner = ?");
  return features.some((feature) => ((version_of.get(feature.id) as { version: number } | undefined)?.version ?? 0) < feature.migrations.length);
}

// Brings an open connection up to date and sets sync to stamp every change; run once each time the database opens.
export function open_store(database: SqlDatabase): void {
  database.exec("PRAGMA foreign_keys = ON");
  adopt_old_versions(database);
  // Each feature keeps its own schema version, so features grow apart without renumbering each other's steps.
  for (const feature of features) migrate(database, feature.migrations, { owner: feature.id });
  install_history(database);
  sync_engine.install(database);
  for (const feature of features) feature.on_open?.(database);
}

// ── Calls ────────────────────────────────────────────────────────────────────

const all_methods = {
  ...(Object.assign({}, ...features.map((feature) => feature.methods)) as typeof settings_feature.methods &
    typeof workouts_feature.methods &
    typeof diet_feature.methods &
    typeof body_feature.methods &
    typeof calculators_feature.methods &
    typeof history_feature.methods),
  // Every setting, the ones never set at their defaults, so a page needs no list of defaults of its own.
  get_settings: (database: SqlDatabase): Record<string, unknown> => ({ ...setting_defaults, ...settings_feature.methods.get_settings(database) }),
};

type Bound<Methods> = {
  [Name in keyof Methods]: Methods[Name] extends (database: SqlDatabase, ...args: infer Args) => infer Result ? (...args: Args) => Result : never;
};

// Every call the page can make, as it makes them, without the database.
export type FitnessMethods = Bound<typeof all_methods>;

export const method_names = Object.keys(all_methods) as (keyof FitnessMethods & string)[];

export { is_read_only };

// What every call does and takes, for programs other than the page.
export const fitness_api = Object.assign({}, ...features.map((feature) => feature.api)) as ApiSpec<FitnessMethods>;

// The calls run on the database given; after each write the features catch up, the history records what it touched and
// on_change tells the other pages and devices.
export function bind_methods(database: () => SqlDatabase, on_change: () => void): FitnessMethods {
  const bound = method_names.map((name) => {
    const method = all_methods[name] as (database: SqlDatabase, ...args: unknown[]) => unknown;
    const call = (...args: unknown[]): unknown => {
      const result = method(database(), ...args);
      if (is_read_only(name)) return result;
      const after_write = () => {
        for (const feature of features) feature.after_write?.(database());
        record_history(database());
        on_change();
      };
      if (result instanceof Promise) return result.then((value: unknown) => (after_write(), value));
      after_write();
      return result;
    };
    return [name, call];
  });
  return Object.fromEntries(bound) as FitnessMethods;
}
