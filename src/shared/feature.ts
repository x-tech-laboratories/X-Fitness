// What each part of X-Fitness, such as workouts or diet, brings to the one database every device keeps: its tables,
// which of them sync, and the calls the page makes on them.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ApiSpec } from "@x-tech-laboratories/x-libs/api_spec";
import { open_drizzle, type Drizzle } from "@x-tech-laboratories/x-libs/drizzle";
import type { MigrationStep, SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import type { SyncedTable } from "@x-tech-laboratories/x-libs/sync_engine";

// ── Features ─────────────────────────────────────────────────────────────────

// A call runs where the database is: on the server, in the desktop app's main process, or in the phone's page.
export type StoreMethod = (database: SqlDatabase, ...args: never[]) => unknown;

export interface Feature<Methods extends Record<string, StoreMethod>> {
  id: string;
  // Each step runs once, in order, such as drizzle-kit's bundled migrations; a released step is never edited, only followed by a new one.
  migrations: readonly MigrationStep[];
  // Parents before children; every table the page writes syncs unless it is only this device's.
  tables: SyncedTable[];
  // Names that read start with list_, get_, search_, lookup_ or export_, so a write is the only call that announces a change.
  methods: Methods;
  // What each call does and takes, for programs that reach them through MCP or the API.
  api: ApiSpec<Methods>;
  // Settings this feature reads, by key such as "workouts.default_rest", with their defaults.
  setting_defaults?: Record<string, unknown>;
  // Runs after every write the page, API or MCP makes, before history records it, such as goals that follow a plan.
  after_write?: (database: SqlDatabase) => void;
}

export function define_feature<Methods extends Record<string, StoreMethod>>(feature: Feature<Methods>): Feature<Methods> {
  return feature;
}

// A new id that every device can make on its own without clashing.
export function new_id(): string {
  return crypto.randomUUID();
}

const drizzles = new WeakMap<SqlDatabase, Drizzle>();

// Typed queries on the connection given, made once per connection.
export function drizzle_of(database: SqlDatabase): Drizzle {
  let drizzle = drizzles.get(database);
  if (!drizzle) drizzles.set(database, (drizzle = open_drizzle(database)));
  return drizzle;
}
