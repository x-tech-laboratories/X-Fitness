// Body metrics: weight, body fat, girths and any other measure, one reading per metric a day and a note per day.

// ── Imports ──────────────────────────────────────────────────────────────────

import { and, asc, count, desc, eq, gte, lte, max, ne, sql, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, drizzle_of, new_id } from "../feature.ts";
import { import_trilium_body } from "./importer.ts";
import { migrations } from "./migrations/index.ts";
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
import { body_days, body_metrics, body_readings, body_tables } from "./schema.ts";

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

// ── Reading ──────────────────────────────────────────────────────────────────

const metric_fields = {
  id: body_metrics.id,
  name: body_metrics.name,
  kind: body_metrics.kind,
  unit: body_metrics.unit,
  goal: body_metrics.goal,
  comment: body_metrics.comment,
  position: body_metrics.position,
};

function list_metrics(database: SqlDatabase): BodyMetric[] {
  const rows = drizzle_of(database).select(metric_fields).from(body_metrics).orderBy(asc(body_metrics.position), asc(body_metrics.name)).all();
  return rows.map((row) => ({ ...row, kind: kind_of(row.kind) }));
}

function find_metric(database: SqlDatabase, id: string): BodyMetric {
  const row = drizzle_of(database).select(metric_fields).from(body_metrics).where(eq(body_metrics.id, id)).get();
  if (!row) throw new Error(`No metric ${id}`);
  return { ...row, kind: kind_of(row.kind) };
}

const point_fields = { date: body_readings.date, value: body_readings.value };

// Every reading of one metric, oldest first.
function metric_series(database: SqlDatabase, metric_id: string): Point[] {
  return drizzle_of(database).select(point_fields).from(body_readings).where(eq(body_readings.metric_id, metric_id)).orderBy(asc(body_readings.date)).all();
}

function latest_on_or_before(database: SqlDatabase, metric_id: string, date: string): Point | null {
  const row = drizzle_of(database)
    .select(point_fields)
    .from(body_readings)
    .where(and(eq(body_readings.metric_id, metric_id), lte(body_readings.date, date)))
    .orderBy(desc(body_readings.date))
    .limit(1)
    .get();
  return row ?? null;
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
  const db = drizzle_of(database);
  const history = new Map<string, HistoryDay>();
  const day_of = (date: string) => history.get(date) ?? history.set(date, { date, values: {}, comment: "" }).get(date)!;
  const readings = db.select().from(body_readings).where(gte(body_readings.date, from)).all();
  for (const reading of readings) day_of(reading.date).values[reading.metric_id] = reading.value;
  for (const note of db.select().from(body_days).where(gte(body_days.date, from)).all()) day_of(note.date).comment = note.comment;
  return [...history.values()].sort((first, second) => second.date.localeCompare(first.date));
}

// The position after every metric's.
export function next_metric_position(database: SqlDatabase): number {
  return drizzle_of(database).select({ next: sql<number>`coalesce(max(${body_metrics.position}) + 1, 0)` }).from(body_metrics).get()!.next;
}

// ── Writing ──────────────────────────────────────────────────────────────────

function save_metric(database: SqlDatabase, input: MetricInput): string {
  const db = drizzle_of(database);
  const metric = normalize_metric(input);
  const fields = { name: metric.name, kind: metric.kind, unit: metric.unit, goal: metric.goal, comment: metric.comment };
  const existing = input.id ? db.select({ id: body_metrics.id }).from(body_metrics).where(eq(body_metrics.id, input.id)).get() : undefined;
  if (existing && input.id) {
    db.update(body_metrics).set(fields).where(eq(body_metrics.id, input.id)).run();
    return input.id;
  }
  const id = input.id || new_id();
  db.insert(body_metrics).values({ id, ...fields, position: next_metric_position(database) }).run();
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
    ids.forEach((metric_id, position) =>
      drizzle_of(database).update(body_metrics).set({ position }).where(and(eq(body_metrics.id, metric_id), ne(body_metrics.position, position))).run(),
    );
  });
}

// ── Store ────────────────────────────────────────────────────────────────────

export const body_feature = define_feature({
  id: "body",
  migrations: migrations.map((migration) => migration.statements),
  tables: synced_tables(body_tables),
  methods: {
    list_body_metrics: (database: SqlDatabase): MetricSummary[] => {
      const counts = drizzle_of(database)
        .select({ metric_id: body_readings.metric_id, readings: count(), last_date: max(body_readings.date) })
        .from(body_readings)
        .groupBy(body_readings.metric_id)
        .all();
      const by_metric = new Map(counts.map((row) => [row.metric_id, row]));
      return list_metrics(database).map((metric) => ({ ...metric, readings: by_metric.get(metric.id)?.readings ?? 0, last_date: by_metric.get(metric.id)?.last_date ?? "" }));
    },

    save_body_metric: (database: SqlDatabase, metric: MetricInput): string => save_metric(database, metric),

    move_body_metric: (database: SqlDatabase, id: string, delta: number): void => move_metric(database, id, delta),

    // A metric's readings go with it, since nothing else could show them; gives how many went.
    delete_body_metric: (database: SqlDatabase, id: string): number =>
      in_transaction(database, () => {
        const db = drizzle_of(database);
        const { changes } = db.delete(body_readings).where(eq(body_readings.metric_id, id)).run();
        db.delete(body_metrics).where(eq(body_metrics.id, id)).run();
        return Number(changes);
      }),

    // One day as the log shows it: each metric's reading, the one before it, and BMI from the latest weight.
    get_body_day: (database: SqlDatabase, date: string): BodyDay => {
      check_day(date);
      const db = drizzle_of(database);
      const metrics = list_metrics(database);
      const values = db.select({ metric_id: body_readings.metric_id, value: body_readings.value }).from(body_readings).where(eq(body_readings.date, date)).all();
      const by_metric = new Map(values.map((row) => [row.metric_id, row.value]));
      const day = db.select({ comment: body_days.comment }).from(body_days).where(eq(body_days.date, date)).get();
      const rows = metrics.map((metric) => ({ metric, value: by_metric.get(metric.id) ?? null, previous: latest_on_or_before(database, metric.id, shift_day(date, -1)) }));
      const weight = weight_metric(metrics);
      const weight_reading = weight ? latest_on_or_before(database, weight.id, date) : null;
      const bmi = weight_reading ? body_mass_index(weight_reading.value, height_of(database)) : 0;
      return { date, comment: day?.comment ?? "", rows, bmi: weight_reading && bmi > 0 ? { value: bmi, weight: weight_reading } : null };
    },

    // A value of null or not above 0 removes the day's reading.
    set_body_reading: (database: SqlDatabase, metric_id: string, date: string, value: number | null): void => {
      check_day(date);
      const db = drizzle_of(database);
      if (value === null || !(Number(value) > 0)) {
        db.delete(body_readings).where(and(eq(body_readings.metric_id, metric_id), eq(body_readings.date, date))).run();
        return;
      }
      db.insert(body_readings)
        .values({ metric_id, date, value: Number(value) })
        .onConflictDoUpdate({ target: [body_readings.metric_id, body_readings.date], set: { value: Number(value) } })
        .run();
    },

    // An empty note removes the day's row, so a day with nothing in it leaves nothing behind.
    set_body_note: (database: SqlDatabase, date: string, comment: string): void => {
      check_day(date);
      const db = drizzle_of(database);
      const text = comment.trim();
      if (!text) db.delete(body_days).where(eq(body_days.date, date)).run();
      else db.insert(body_days).values({ date, comment: text }).onConflictDoUpdate({ target: body_days.date, set: { comment: text } }).run();
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
