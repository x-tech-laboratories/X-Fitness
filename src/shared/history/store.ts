// Every change to the things a person makes and edits, such as a workout, a food or a day's body readings, kept as
// versions through X-Libs history: any version can be restored, and a deleted item brought back. The versions sync.

// ── Imports ──────────────────────────────────────────────────────────────────

import { create_history, type History, type HistoryWatch, type Version, type VersionKind } from "@x-tech-laboratories/x-libs/history";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { id_of, text } from "../api_schemas.ts";
import { define_feature } from "../feature.ts";

// ── Snapshots ────────────────────────────────────────────────────────────────

// An item's rows by table, such as a workout's row with its exercises and their sets.
export type Snapshot = Record<string, Record<string, unknown>[]>;

// One table of an item: its rows whose column holds the item's id, or a value from the rows of an earlier level.
interface Level {
  table: string;
  column: string;
  from?: { level: number; column: string };
}

function read_levels(database: SqlDatabase, levels: Level[], item_id: string): Record<string, unknown>[][] {
  const found: Record<string, unknown>[][] = [];
  for (const level of levels) {
    const values = level.from ? found[level.from.level]!.map((row) => row[level.from!.column]) : [item_id];
    const rows = values.length
      ? (database.prepare(`SELECT * FROM ${level.table} WHERE ${level.column} IN (${values.map(() => "?").join(", ")}) ORDER BY rowid`).all(...(values as string[])) as Record<string, unknown>[])
      : [];
    found.push(rows.map((row) => ({ ...row })));
  }
  return found;
}

function read_snapshot(database: SqlDatabase, levels: Level[], item_id: string): Snapshot | null {
  const found = read_levels(database, levels, item_id);
  if (found.every((rows) => rows.length === 0)) return null;
  return Object.fromEntries(levels.map((level, index) => [level.table, found[index]!]));
}

// Puts an item's rows back as the snapshot has them: its rows now go, children first, and the snapshot's go in.
function apply_snapshot(database: SqlDatabase, levels: Level[], item_id: string, snapshot: Snapshot): void {
  const current = read_levels(database, levels, item_id);
  for (let index = levels.length - 1; index >= 0; index--) {
    const level = levels[index]!;
    const values = level.from ? current[level.from.level]!.map((row) => row[level.from!.column]) : [item_id];
    if (values.length) database.prepare(`DELETE FROM ${level.table} WHERE ${level.column} IN (${values.map(() => "?").join(", ")})`).run(...(values as string[]));
  }
  for (const level of levels) {
    for (const row of snapshot[level.table] ?? []) {
      const columns = Object.keys(row);
      database.prepare(`INSERT INTO ${level.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...(Object.values(row) as never[]));
    }
  }
}

// ── Items ────────────────────────────────────────────────────────────────────

interface ItemKind {
  kind: string;
  label: string;
  item_table: string;
  item_key?: string;
  levels: Level[];
  watches: HistoryWatch[];
  // Rows that hold no id of the item, such as a set under a workout's exercise, note it through their parent.
  lookups?: { table: string; sql: (row: "NEW" | "OLD") => string }[];
  name_of: (snapshot: Snapshot) => string;
  summary: (snapshot: Snapshot) => string;
}

const first = (snapshot: Snapshot, table: string) => snapshot[table]?.[0];
const count = (snapshot: Snapshot, table: string, word: string) => {
  const total = snapshot[table]?.length ?? 0;
  return `${total} ${word}${total === 1 ? "" : "s"}`;
};

export const item_kinds: ItemKind[] = [
  {
    kind: "workout",
    label: "Workout",
    item_table: "workouts",
    levels: [
      { table: "workouts", column: "id" },
      { table: "workout_exercises", column: "workout_id", from: { level: 0, column: "id" } },
      { table: "workout_sets", column: "workout_exercise_id", from: { level: 1, column: "id" } },
    ],
    watches: [{ table: "workouts", item_columns: ["id"] }, { table: "workout_exercises", item_columns: ["workout_id"] }],
    lookups: [{ table: "workout_sets", sql: (row) => `SELECT workout_id FROM workout_exercises WHERE id = ${row}.workout_exercise_id` }],
    name_of: (snapshot) => `${String(first(snapshot, "workouts")?.name || "Workout")} on ${String(first(snapshot, "workouts")?.date ?? "")}`.trim(),
    summary: (snapshot) => `${count(snapshot, "workout_exercises", "exercise")}, ${count(snapshot, "workout_sets", "set")}`,
  },
  {
    kind: "exercise",
    label: "Exercise",
    item_table: "exercises",
    levels: [{ table: "exercises", column: "id" }],
    watches: [{ table: "exercises", item_columns: ["id"] }],
    name_of: (snapshot) => String(first(snapshot, "exercises")?.name ?? "Exercise"),
    summary: (snapshot) => String(first(snapshot, "exercises")?.measurement ?? ""),
  },
  {
    kind: "program",
    label: "Program",
    item_table: "programs",
    levels: [
      { table: "programs", column: "id" },
      { table: "program_sessions", column: "program_id", from: { level: 0, column: "id" } },
      { table: "session_exercises", column: "session_id", from: { level: 1, column: "id" } },
    ],
    watches: [{ table: "programs", item_columns: ["id"] }, { table: "program_sessions", item_columns: ["program_id"] }],
    lookups: [{ table: "session_exercises", sql: (row) => `SELECT program_id FROM program_sessions WHERE id = ${row}.session_id` }],
    name_of: (snapshot) => String(first(snapshot, "programs")?.name ?? "Program"),
    summary: (snapshot) => `${count(snapshot, "program_sessions", "session")}, ${count(snapshot, "session_exercises", "exercise")}`,
  },
  {
    kind: "food",
    label: "Food",
    item_table: "diet_foods",
    levels: [{ table: "diet_foods", column: "id" }],
    watches: [{ table: "diet_foods", item_columns: ["id"] }],
    name_of: (snapshot) => String(first(snapshot, "diet_foods")?.name ?? "Food"),
    summary: (snapshot) => String(first(snapshot, "diet_foods")?.brand ?? ""),
  },
  {
    kind: "recipe",
    label: "Recipe",
    item_table: "diet_recipes",
    levels: [
      { table: "diet_recipes", column: "id" },
      { table: "diet_ingredients", column: "recipe_id", from: { level: 0, column: "id" } },
    ],
    watches: [{ table: "diet_recipes", item_columns: ["id"] }, { table: "diet_ingredients", item_columns: ["recipe_id"] }],
    name_of: (snapshot) => String(first(snapshot, "diet_recipes")?.name ?? "Recipe"),
    summary: (snapshot) => count(snapshot, "diet_ingredients", "ingredient"),
  },
  {
    kind: "diary",
    label: "Diary entry",
    item_table: "diet_diary",
    levels: [{ table: "diet_diary", column: "id" }],
    watches: [{ table: "diet_diary", item_columns: ["id"] }],
    name_of: (snapshot) => `Diary entry on ${String(first(snapshot, "diet_diary")?.date ?? "")}`.trim(),
    summary: (snapshot) => {
      const entry = first(snapshot, "diet_diary");
      if (!entry) return "";
      const amount = Number(entry.amount);
      return `${amount} ${String(entry.unit || (amount === 1 ? "serving" : "servings"))} of a ${String(entry.kind)}`;
    },
  },
  {
    kind: "metric",
    label: "Body metric",
    item_table: "body_metrics",
    levels: [{ table: "body_metrics", column: "id" }],
    watches: [{ table: "body_metrics", item_columns: ["id"] }],
    name_of: (snapshot) => String(first(snapshot, "body_metrics")?.name ?? "Metric"),
    summary: (snapshot) => String(first(snapshot, "body_metrics")?.kind ?? ""),
  },
  {
    kind: "body_day",
    label: "Body day",
    item_table: "body_days",
    item_key: "date",
    levels: [
      { table: "body_days", column: "date" },
      { table: "body_readings", column: "date" },
    ],
    watches: [{ table: "body_days", item_columns: ["date"] }, { table: "body_readings", item_columns: ["date"] }],
    name_of: (snapshot) => `Body on ${String(first(snapshot, "body_days")?.date ?? first(snapshot, "body_readings")?.date ?? "")}`.trim(),
    summary: (snapshot) => count(snapshot, "body_readings", "reading"),
  },
];

const histories = new Map<string, History<Snapshot>>(
  item_kinds.map((item) => [
    item.kind,
    create_history<Snapshot>({
      name: `${item.kind}_history`,
      item_table: item.item_table,
      item_key: item.item_key,
      watches: item.watches,
      read: (database, item_id) => read_snapshot(database, item.levels, item_id),
      apply: (database, item_id, snapshot) => apply_snapshot(database, item.levels, item_id, snapshot),
    }),
  ]),
);

function kind_of(kind: string): { item: ItemKind; history: History<Snapshot> } {
  const item = item_kinds.find((each) => each.kind === kind);
  const history = histories.get(kind);
  if (!item || !history) throw new Error(`no history of ${kind}`);
  return { item, history };
}

// ── Keeping ──────────────────────────────────────────────────────────────────

export const history_tables = [...histories.values()].map((history) => history.synced_table);

export const history_setting_defaults = {
  // Versions older than this are pruned, each item keeping its newest.
  "history.keep_days": 180,
};

function keep_days(database: SqlDatabase): number {
  const row = database.prepare("SELECT value FROM settings WHERE key = 'history.keep_days'").get() as { value: string } | undefined;
  const days = row ? Number(JSON.parse(row.value)) : history_setting_defaults["history.keep_days"];
  return Number.isFinite(days) && days > 0 ? days : history_setting_defaults["history.keep_days"];
}

// Run each time the database opens, before sync installs, since the versions tables sync too.
export function install_history(database: SqlDatabase): void {
  for (const [kind, history] of histories) {
    history.install(database);
    for (const lookup of kind_of(kind).item.lookups ?? []) {
      for (const event of ["insert", "update", "delete"] as const) {
        const row = event === "delete" ? "OLD" : "NEW";
        const name = `${kind}_history_versions_${lookup.table}_${event}`;
        database.exec(`DROP TRIGGER IF EXISTS ${name}`);
        database.exec(`CREATE TRIGGER ${name} AFTER ${event.toUpperCase()} ON ${lookup.table} BEGIN INSERT OR IGNORE INTO ${kind}_history_versions_pending ${lookup.sql(row)}; END`);
      }
    }
  }
  prune_history(database);
}

export function prune_history(database: SqlDatabase, now = Date.now()): void {
  const cutoff = new Date(now - keep_days(database) * 24 * 60 * 60 * 1000).toISOString();
  for (const history of histories.values()) history.prune(database, cutoff);
}

const pruned_at = new WeakMap<SqlDatabase, number>();

// Saves a version of every item a write touched; run after each write, however it was made. Old versions go at most
// once a day too, so a server that runs for weeks still prunes.
export function record_history(database: SqlDatabase, now = Date.now()): void {
  for (const history of histories.values()) history.record(database);
  const last = pruned_at.get(database);
  if (last !== undefined && now - last < 24 * 60 * 60 * 1000) return;
  pruned_at.set(database, now);
  prune_history(database, now);
}

// Writes that arrive by sync are recorded by the device that made them.
export function forget_synced_changes(database: SqlDatabase): void {
  for (const history of histories.values()) history.forget_touched(database);
}

// ── Calls ────────────────────────────────────────────────────────────────────

export interface ItemChange {
  id: string;
  kind: string;
  kind_label: string;
  item_id: string;
  item_name: string;
  summary: string;
  changed_at: string;
  change: VersionKind;
  origin: "here" | "elsewhere";
}

function as_change(item: ItemKind, version: Version<Snapshot>): ItemChange {
  return {
    id: version.id,
    kind: item.kind,
    kind_label: item.label,
    item_id: version.item_id,
    item_name: item.name_of(version.snapshot),
    summary: item.summary(version.snapshot),
    changed_at: version.changed_at,
    change: version.kind,
    origin: version.origin,
  };
}

const kinds = item_kinds.map((item) => item.kind);

export const history_feature = define_feature({
  id: "history",
  migrations: [],
  tables: history_tables,
  setting_defaults: history_setting_defaults,
  methods: {
    list_item_history: (database: SqlDatabase, kind: string, item_id: string): ItemChange[] => {
      const { item, history } = kind_of(kind);
      return history.read_versions(database, item_id).map((version) => as_change(item, version));
    },
    list_recent_changes: (database: SqlDatabase, limit: number): ItemChange[] =>
      item_kinds
        .flatMap((item) => kind_of(item.kind).history.read_recent(database, limit).map((version) => as_change(item, version)))
        .sort((first_change, second_change) => second_change.changed_at.localeCompare(first_change.changed_at))
        .slice(0, limit),
    restore_item_version: (database: SqlDatabase, kind: string, version_id: string): void => kind_of(kind).history.restore(database, version_id),
  },
  api: {
    list_item_history: {
      description: "Lists one item's versions, newest first: when each was made, whether it was created, edited, deleted or restored, and on this device or another.",
      params: [
        { name: "kind", schema: { type: "string", enum: kinds, description: "What the item is." } },
        { name: "item_id", schema: { ...id_of("item"), description: "The item's id; for a body day, its date." } },
      ],
    },
    list_recent_changes: {
      description: "Lists the latest changes to every item, newest first, deleted items included.",
      params: [{ name: "limit", schema: { type: "integer", minimum: 1, description: "How many changes at most." } }],
    },
    restore_item_version: {
      description: "Brings an item back to one of its versions, or a deleted item back with what was deleted along with it.",
      params: [
        { name: "kind", schema: { type: "string", enum: kinds, description: "What the item is." } },
        { name: "version_id", schema: text("The version's id from list_item_history or list_recent_changes.") },
      ],
    },
  },
});
