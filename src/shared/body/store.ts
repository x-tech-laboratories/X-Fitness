// Body metrics: weight, body fat, girths and any other measure, one reading per metric a day and a note per day.

// ── Imports ──────────────────────────────────────────────────────────────────

import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, new_id } from "../feature.ts";
import { import_trilium_body } from "./importer.ts";
import {
  average_days,
  body_mass_index,
  is_day,
  kind_of,
  moving_average,
  normalize_metric,
  range_start,
  series_stats,
  shift_day,
  type BodyMetric,
  type MetricInput,
  type Point,
  type SeriesStats,
} from "./readings.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface MetricSummary extends BodyMetric {
  readings: number;
  // The day of the latest reading, or "" when there is none.
  last_date: string;
}

export interface DayRow {
  metric: BodyMetric;
  // This day's reading, or null when there is none.
  value: number | null;
  // The latest reading before this day.
  previous: Point | null;
}

export interface Bmi {
  value: number;
  // The weight it is worked out from.
  weight: Point;
}

export interface BodyDay {
  date: string;
  comment: string;
  rows: DayRow[];
  bmi: Bmi | null;
}

export interface BodyReport {
  metric: BodyMetric;
  series: Point[];
  average: Point[];
  stats: SeriesStats | null;
  // The goal less the latest reading, or null without both.
  to_go: number | null;
  bmi: number | null;
}

export interface HistoryDay {
  date: string;
  values: Record<string, number>;
  comment: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const body_setting_defaults = {
  // In cm; above 0 it turns on BMI.
  "body.height": 0,
};

// Fixed ids, so two devices that both start fresh hold the same metrics rather than one copy each.
const default_metrics: [id: string, name: string, kind: string, unit: string][] = [
  ["weight", "Weight", "weight", ""],
  ["bodyfat", "Body Fat", "percent", ""],
  ["waist", "Waist", "length", ""],
  ["chest", "Chest", "length", ""],
  ["hips", "Hips", "length", ""],
  ["arm", "Arm", "length", ""],
  ["thigh", "Thigh", "length", ""],
  ["neck", "Neck", "length", ""],
  ["restinghr", "Resting Heart Rate", "custom", "bpm"],
];

const seed_sql = default_metrics
  .map(([id, name, kind, unit], position) => `INSERT INTO body_metrics (id, name, kind, unit, position) VALUES ('${id}', '${name}', '${kind}', '${unit}', ${position});`)
  .join("\n");

// ── Reading ──────────────────────────────────────────────────────────────────

const metric_columns = "id, name, kind, unit, goal, comment, position";

function list_metrics(database: SqlDatabase): BodyMetric[] {
  const rows = database.prepare(`SELECT ${metric_columns} FROM body_metrics ORDER BY position, name`).all() as unknown as BodyMetric[];
  return rows.map((row) => ({ ...row, kind: kind_of(row.kind) }));
}

function find_metric(database: SqlDatabase, id: string): BodyMetric {
  const row = database.prepare(`SELECT ${metric_columns} FROM body_metrics WHERE id = ?`).get(id) as BodyMetric | undefined;
  if (!row) throw new Error(`No metric ${id}`);
  return { ...row, kind: kind_of(row.kind) };
}

// Every reading of one metric, oldest first.
function metric_series(database: SqlDatabase, metric_id: string): Point[] {
  const rows = database.prepare("SELECT date, value FROM body_readings WHERE metric_id = ? ORDER BY date").all(metric_id) as unknown as Point[];
  return rows.map((row) => ({ ...row }));
}

function latest_on_or_before(database: SqlDatabase, metric_id: string, date: string): Point | null {
  const row = database.prepare("SELECT date, value FROM body_readings WHERE metric_id = ? AND date <= ? ORDER BY date DESC LIMIT 1").get(metric_id, date) as Point | undefined;
  return row ? { ...row } : null;
}

function height_of(database: SqlDatabase): number {
  const row = database.prepare("SELECT value FROM settings WHERE key = 'body.height'").get() as { value: string } | undefined;
  const height = Number(row ? JSON.parse(row.value) : body_setting_defaults["body.height"]);
  return Number.isFinite(height) ? height : 0;
}

// BMI is worked out from the first weight metric, as the order lists them.
function weight_metric(metrics: BodyMetric[]): BodyMetric | undefined {
  return metrics.find((metric) => metric.kind === "weight");
}

function check_day(date: unknown): string {
  if (!is_day(date)) throw new Error(`Not a day: ${String(date)}`);
  return date;
}

// Every day with anything logged from the day given, newest first.
function list_history(database: SqlDatabase, from: string): HistoryDay[] {
  const history = new Map<string, HistoryDay>();
  const day_of = (date: string) => history.get(date) ?? history.set(date, { date, values: {}, comment: "" }).get(date)!;
  const readings = database.prepare("SELECT metric_id, date, value FROM body_readings WHERE date >= ?").all(from) as { metric_id: string; date: string; value: number }[];
  for (const reading of readings) day_of(reading.date).values[reading.metric_id] = reading.value;
  const notes = database.prepare("SELECT date, comment FROM body_days WHERE date >= ?").all(from) as { date: string; comment: string }[];
  for (const note of notes) day_of(note.date).comment = note.comment;
  return [...history.values()].sort((first, second) => second.date.localeCompare(first.date));
}

// ── Writing ──────────────────────────────────────────────────────────────────

function save_metric(database: SqlDatabase, input: MetricInput): string {
  const metric = normalize_metric(input);
  const existing = input.id ? database.prepare("SELECT id FROM body_metrics WHERE id = ?").get(input.id) : undefined;
  if (existing && input.id) {
    database.prepare("UPDATE body_metrics SET name = ?, kind = ?, unit = ?, goal = ?, comment = ? WHERE id = ?")
      .run(metric.name, metric.kind, metric.unit, metric.goal, metric.comment, input.id);
    return input.id;
  }
  const id = input.id || new_id();
  const { next } = database.prepare("SELECT COALESCE(MAX(position) + 1, 0) AS next FROM body_metrics").get() as { next: number };
  database.prepare("INSERT INTO body_metrics (id, name, kind, unit, goal, comment, position) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, metric.name, metric.kind, metric.unit, metric.goal, metric.comment, next);
  return id;
}

// Swaps a metric with its neighbour, numbering them all afresh so ties left by two devices come apart.
function move_metric(database: SqlDatabase, id: string, delta: number): void {
  const ids = list_metrics(database).map((metric) => metric.id);
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  in_transaction(database, () => {
    const update = database.prepare("UPDATE body_metrics SET position = ? WHERE id = ? AND position IS NOT ?");
    ids.forEach((metric_id, position) => update.run(position, metric_id, position));
  });
}

// ── Store ────────────────────────────────────────────────────────────────────

export const body_feature = define_feature({
  id: "body",
  migrations: [
    `CREATE TABLE body_metrics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      goal REAL NOT NULL DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE body_readings (
      metric_id TEXT NOT NULL REFERENCES body_metrics (id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      value REAL NOT NULL,
      PRIMARY KEY (metric_id, date)
    );
    CREATE INDEX body_readings_by_date ON body_readings (date);
    CREATE TABLE body_days (date TEXT PRIMARY KEY, comment TEXT NOT NULL);
    ${seed_sql}`,
  ],
  tables: [
    { name: "body_metrics", key_columns: ["id"] },
    { name: "body_readings", key_columns: ["metric_id", "date"] },
    { name: "body_days", key_columns: ["date"] },
  ],
  methods: {
    list_body_metrics: (database: SqlDatabase): MetricSummary[] => {
      const counts = database.prepare("SELECT metric_id, COUNT(*) AS readings, MAX(date) AS last_date FROM body_readings GROUP BY metric_id").all() as {
        metric_id: string;
        readings: number;
        last_date: string;
      }[];
      const by_metric = new Map(counts.map((row) => [row.metric_id, row]));
      return list_metrics(database).map((metric) => ({ ...metric, readings: by_metric.get(metric.id)?.readings ?? 0, last_date: by_metric.get(metric.id)?.last_date ?? "" }));
    },

    save_body_metric: (database: SqlDatabase, metric: MetricInput): string => save_metric(database, metric),

    move_body_metric: (database: SqlDatabase, id: string, delta: number): void => move_metric(database, id, delta),

    // A metric's readings go with it, since nothing else could show them; gives how many went.
    delete_body_metric: (database: SqlDatabase, id: string): number =>
      in_transaction(database, () => {
        const { changes } = database.prepare("DELETE FROM body_readings WHERE metric_id = ?").run(id);
        database.prepare("DELETE FROM body_metrics WHERE id = ?").run(id);
        return Number(changes);
      }),

    // One day as the log shows it: each metric's reading, the one before it, and BMI from the latest weight.
    get_body_day: (database: SqlDatabase, date: string): BodyDay => {
      check_day(date);
      const metrics = list_metrics(database);
      const values = database.prepare("SELECT metric_id, value FROM body_readings WHERE date = ?").all(date) as { metric_id: string; value: number }[];
      const by_metric = new Map(values.map((row) => [row.metric_id, row.value]));
      const day = database.prepare("SELECT comment FROM body_days WHERE date = ?").get(date) as { comment: string } | undefined;
      const rows = metrics.map((metric) => ({ metric, value: by_metric.get(metric.id) ?? null, previous: latest_on_or_before(database, metric.id, shift_day(date, -1)) }));
      const weight = weight_metric(metrics);
      const weight_reading = weight ? latest_on_or_before(database, weight.id, date) : null;
      const bmi = weight_reading ? body_mass_index(weight_reading.value, height_of(database)) : 0;
      return { date, comment: day?.comment ?? "", rows, bmi: weight_reading && bmi > 0 ? { value: bmi, weight: weight_reading } : null };
    },

    // A value of null or not above 0 removes the day's reading.
    set_body_reading: (database: SqlDatabase, metric_id: string, date: string, value: number | null): void => {
      check_day(date);
      if (value === null || !(Number(value) > 0)) {
        database.prepare("DELETE FROM body_readings WHERE metric_id = ? AND date = ?").run(metric_id, date);
        return;
      }
      database.prepare("INSERT INTO body_readings (metric_id, date, value) VALUES (?, ?, ?) ON CONFLICT (metric_id, date) DO UPDATE SET value = excluded.value")
        .run(metric_id, date, Number(value));
    },

    // An empty note removes the day's row, so a day with nothing in it leaves nothing behind.
    set_body_note: (database: SqlDatabase, date: string, comment: string): void => {
      check_day(date);
      const text = comment.trim();
      if (!text) database.prepare("DELETE FROM body_days WHERE date = ?").run(date);
      else database.prepare("INSERT INTO body_days (date, comment) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET comment = excluded.comment").run(date, text);
    },

    // One metric over the days ending today, 0 for all time; the average runs over the whole series so the first days in range have a full window.
    get_body_report: (database: SqlDatabase, metric_id: string, days: number, today: string): BodyReport => {
      const metric = find_metric(database, metric_id);
      const from = range_start(check_day(today), days);
      const all = metric_series(database, metric.id);
      const series = all.filter((point) => point.date >= from);
      const average = moving_average(all, average_days).filter((point) => point.date >= from);
      const stats = series_stats(series);
      const is_weight = weight_metric(list_metrics(database))?.id === metric.id;
      const bmi = stats && is_weight ? body_mass_index(stats.latest.value, height_of(database)) : 0;
      return { metric, series, average, stats, to_go: stats && metric.goal > 0 ? metric.goal - stats.latest.value : null, bmi: bmi > 0 ? bmi : null };
    },

    // Every day with anything logged in the range, newest first.
    list_body_history: (database: SqlDatabase, days: number, today: string): HistoryDay[] => list_history(database, range_start(check_day(today), days)),

    // The whole log in the Trilium add-on's database.json shape, its numbers in kg and cm as the units field says.
    export_body: (database: SqlDatabase): string => {
      const metrics = list_metrics(database).map(({ id, name, kind, unit, goal, comment }) => ({ id, name, kind, unit, goal, comment }));
      const log: Record<string, { values: Record<string, number>; comment: string }> = {};
      for (const day of list_history(database, "").reverse()) log[day.date] = { values: day.values, comment: day.comment };
      return JSON.stringify({ metrics, log, units: { weight: "kg", length: "cm" } }, null, 4);
    },

    import_trilium_body,
  },
  setting_defaults: body_setting_defaults,
});
