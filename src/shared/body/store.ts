// Body metrics: weight, body fat, girths and any other measure, one reading per metric a day and a note per day; and the
// body goals, one per thing a goal is about, kept apart from the metrics.

// ── Imports ──────────────────────────────────────────────────────────────────

import { and, asc, count, desc, eq, gte, inArray, lte, max, ne, sql, synced_tables } from "@x-tech-laboratories/x-libs/drizzle";
import { read_setting, settings_of } from "@x-tech-laboratories/x-libs/settings";
import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { define_feature, drizzle_of, new_id } from "../feature.ts";
import { body_api } from "./api.ts";
import { migrations } from "./migrations/index.ts";
import {
  average_days,
  body_mass_index,
  body_goal_key_of,
  body_goal_keys,
  is_day,
  kind_of,
  metric_goal_key,
  metric_role_of,
  moving_average,
  normalize_metric,
  positive_number,
  range_start,
  series_stats,
  shift_day,
  type BodyGoal,
  type BodyMetric,
  type BodyGoalKey,
  type MetricInput,
  type Point,
  type SeriesStats,
} from "./readings.ts";
import { check_picture, photo_limit, photo_pose_of, photo_poses, thumbnail_limit, type BodyPhoto, type PhotoInput, type PhotoSummary } from "./photos.ts";
import { body_days, body_goals, body_metrics, body_photos, body_readings, body_tables } from "./schema.ts";
import { body_setting_defaults } from "./settings.ts";
import { girths, type BodyMeasures, type Girth } from "./shape.ts";

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
  // The goal this metric stands for, by its role or as the weight metric, or null when none is set.
  goal: number | null;
  // The goal less the latest reading, or null without both.
  to_go: number | null;
  bmi: number | null;
}

export interface BodyShape {
  date: string;
  // The latest reading of each metric with a role on or before the day.
  measures: BodyMeasures;
  // The goals, falling back to the measures where there is no goal.
  goal: BodyMeasures;
  // Every day with a reading that shapes the body, oldest first.
  days: string[];
}

export interface HistoryDay {
  date: string;
  values: Record<string, number>;
  comment: string;
}

// ── Reading ──────────────────────────────────────────────────────────────────

const metric_fields = {
  id: body_metrics.id,
  name: body_metrics.name,
  kind: body_metrics.kind,
  unit: body_metrics.unit,
  comment: body_metrics.comment,
  position: body_metrics.position,
  role: body_metrics.role,
};

export function list_metrics(database: SqlDatabase): BodyMetric[] {
  const rows = drizzle_of(database).select(metric_fields).from(body_metrics).orderBy(asc(body_metrics.position), asc(body_metrics.name)).all();
  return rows.map((row) => ({ ...row, kind: kind_of(row.kind), role: metric_role_of(row.role) }));
}

function find_metric(database: SqlDatabase, id: string): BodyMetric {
  const row = drizzle_of(database).select(metric_fields).from(body_metrics).where(eq(body_metrics.id, id)).get();
  if (!row) throw new Error(`No metric ${id}`);
  return { ...row, kind: kind_of(row.kind), role: metric_role_of(row.role) };
}

const point_fields = { date: body_readings.date, value: body_readings.value };

// Every reading of one metric, oldest first.
export function metric_series(database: SqlDatabase, metric_id: string): Point[] {
  return drizzle_of(database).select(point_fields).from(body_readings).where(eq(body_readings.metric_id, metric_id)).orderBy(asc(body_readings.date)).all();
}

export function latest_on_or_before(database: SqlDatabase, metric_id: string, date: string): Point | null {
  const row = drizzle_of(database)
    .select(point_fields)
    .from(body_readings)
    .where(and(eq(body_readings.metric_id, metric_id), lte(body_readings.date, date)))
    .orderBy(desc(body_readings.date))
    .limit(1)
    .get();
  return row ?? null;
}

function setting_of(database: SqlDatabase, key: keyof typeof body_setting_defaults): unknown {
  return read_setting(database, key) ?? body_setting_defaults[key];
}

// BMI is worked out from the first weight metric, as the order lists them.
export function weight_metric(metrics: BodyMetric[]): BodyMetric | undefined {
  return metrics.find((metric) => metric.kind === "weight");
}

// The height is the first length metric with the height role.
export function height_metric(metrics: BodyMetric[]): BodyMetric | undefined {
  return metrics.find((metric) => metric.role === "height" && metric.kind === "length");
}

// The latest height reading on or before the day in cm, or 0 without one.
export function height_on(database: SqlDatabase, date: string, metrics = list_metrics(database)): number {
  const metric = height_metric(metrics);
  return metric ? (latest_on_or_before(database, metric.id, date)?.value ?? 0) : 0;
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

// Every goal set, in the order body_goal_keys lists them.
export function list_goals(database: SqlDatabase): BodyGoal[] {
  const rows = drizzle_of(database).select().from(body_goals).all();
  const by_key = new Map(rows.map((row) => [row.key, row.value]));
  return body_goal_keys.flatMap(({ key }) => (by_key.get(key) ?? 0) > 0 ? [{ key, value: by_key.get(key)! }] : []);
}

// The goals set, by what each is about.
export function goals_by_key(database: SqlDatabase): Partial<Record<BodyGoalKey, number>> {
  return Object.fromEntries(list_goals(database).map((goal) => [goal.key, goal.value]));
}

// The readings that shape the 3D body on a day, and the body the goals would give.
function body_shape(database: SqlDatabase, date: string): BodyShape {
  const metrics = list_metrics(database);
  const goals = goals_by_key(database);
  const sex_setting = setting_of(database, "body.sex");
  const sex = sex_setting === "female" || sex_setting === "male" ? sex_setting : "";
  const height = height_on(database, date, metrics);
  const measures: BodyMeasures = { sex, height, mass: 0, body_fat: 0, girths: {} };
  const goal: BodyMeasures = { sex, height, mass: 0, body_fat: 0, girths: {} };
  const shaping: string[] = [];
  // A goal shapes the goal body even without a metric; today's weight and body fat fill in for theirs, a girth without a goal is left out.
  const take = (metric: BodyMetric | undefined, key: BodyGoalKey, kept_without_goal: boolean, put: (into: BodyMeasures, value: number) => void) => {
    if (metric) shaping.push(metric.id);
    const latest = metric ? (latest_on_or_before(database, metric.id, date)?.value ?? 0) : 0;
    if (metric) put(measures, latest);
    const target = goals[key] ?? (kept_without_goal ? latest : 0);
    if (target > 0 || (metric && kept_without_goal)) put(goal, target);
  };
  take(weight_metric(metrics), "weight", true, (into, value) => (into.mass = value));
  take(metrics.find((metric) => metric.role === "body_fat"), "body_fat", true, (into, value) => (into.body_fat = value));
  for (const girth of girths) {
    take(metrics.find((metric) => metric.role === girth && metric.kind === "length"), girth, false, (into, value) => (into.girths[girth as Girth] = value));
  }
  const days = shaping.length
    ? drizzle_of(database).selectDistinct({ date: body_readings.date }).from(body_readings).where(inArray(body_readings.metric_id, shaping)).orderBy(asc(body_readings.date)).all()
    : [];
  return { date, measures, goal, days: days.map((row) => row.date) };
}

// The position after every metric's.
export function next_metric_position(database: SqlDatabase): number {
  return drizzle_of(database).select({ next: sql<number>`coalesce(max(${body_metrics.position}) + 1, 0)` }).from(body_metrics).get()!.next;
}

// ── Writing ──────────────────────────────────────────────────────────────────

function save_metric(database: SqlDatabase, input: MetricInput): string {
  const db = drizzle_of(database);
  const metric = normalize_metric(input);
  const fields = { name: metric.name, kind: metric.kind, unit: metric.unit, comment: metric.comment, role: metric.role };
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

// A value of null or not above 0 removes the goal.
function set_goal(database: SqlDatabase, key: string, value: number | null): void {
  const goal_key = body_goal_key_of(key);
  if (!goal_key) throw new Error(`No goal can be about ${String(key)}`);
  const db = drizzle_of(database);
  const target = positive_number(value);
  if (target === 0) db.delete(body_goals).where(eq(body_goals.key, goal_key)).run();
  else db.insert(body_goals).values({ key: goal_key, value: target }).onConflictDoUpdate({ target: body_goals.key, set: { value: target } }).run();
}

// ── Photos ───────────────────────────────────────────────────────────────────

const photo_fields = { id: body_photos.id, date: body_photos.date, pose: body_photos.pose, comment: body_photos.comment, thumbnail: body_photos.thumbnail, picture: body_photos.picture };

// Every photo newest day first, each day's in the order photo_poses lists them, the picture standing in for a missing thumbnail.
function list_photos(database: SqlDatabase): PhotoSummary[] {
  const rows = drizzle_of(database)
    .select({ ...photo_fields, picture: sql<string>`CASE WHEN ${body_photos.thumbnail} = '' THEN ${body_photos.picture} ELSE '' END` })
    .from(body_photos)
    .orderBy(desc(body_photos.date), asc(body_photos.id))
    .all();
  const photos = rows.map(({ picture, ...row }) => ({ ...row, pose: photo_pose_of(row.pose), thumbnail: row.thumbnail || picture }));
  const place = (pose: string) => photo_poses.findIndex((each) => each.key === pose);
  return photos.sort((first, second) => second.date.localeCompare(first.date) || place(first.pose) - place(second.pose));
}

function get_photo(database: SqlDatabase, id: string): BodyPhoto {
  const row = drizzle_of(database).select(photo_fields).from(body_photos).where(eq(body_photos.id, id)).get();
  if (!row) throw new Error(`No photo ${id}`);
  return { ...row, pose: photo_pose_of(row.pose), thumbnail: row.thumbnail || row.picture };
}

function save_photo(database: SqlDatabase, input: PhotoInput): string {
  const db = drizzle_of(database);
  const picture = check_picture(input.picture, photo_limit, "picture");
  const thumbnail = check_picture(input.thumbnail, thumbnail_limit, "thumbnail");
  const fields = {
    date: check_day(input.date),
    pose: photo_pose_of(input.pose),
    comment: (input.comment ?? "").trim(),
    ...(picture === undefined ? {} : { picture }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
  };
  const existing = input.id ? db.select({ id: body_photos.id }).from(body_photos).where(eq(body_photos.id, input.id)).get() : undefined;
  if (existing && input.id) {
    // A new picture without a thumbnail drops the old one, which would show the old picture.
    const thumbnail_kept = picture !== undefined && thumbnail === undefined ? { thumbnail: "" } : {};
    db.update(body_photos).set({ ...thumbnail_kept, ...fields }).where(eq(body_photos.id, input.id)).run();
    return input.id;
  }
  if (!picture) throw new Error("A new photo needs a picture.");
  const id = input.id || new_id();
  db.insert(body_photos).values({ id, ...fields, picture }).run();
  return id;
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
      const bmi = weight_reading ? body_mass_index(weight_reading.value, height_on(database, date, metrics)) : 0;
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
      const bmi = stats && is_weight ? body_mass_index(stats.latest.value, height_on(database, stats.latest.date)) : 0;
      const goal_key = metric_goal_key(metric, is_weight);
      const goal = goal_key ? (goals_by_key(database)[goal_key] ?? null) : null;
      return { metric, series, average, stats, goal, to_go: stats && goal !== null ? goal - stats.latest.value : null, bmi: bmi > 0 ? bmi : null };
    },

    // What the 3D body is drawn from on a day: sex, height, weight, body fat and girths, now and at the goals.
    get_body_shape: (database: SqlDatabase, date: string): BodyShape => body_shape(database, check_day(date)),

    list_body_goals: (database: SqlDatabase): BodyGoal[] => list_goals(database),

    set_body_goal: (database: SqlDatabase, key: BodyGoalKey, value: number | null): void => set_goal(database, key, value),

    // Every day with anything logged in the range, newest first.
    list_body_history: (database: SqlDatabase, days: number, today: string): HistoryDay[] => list_history(database, range_start(check_day(today), days)),

    list_body_photos: (database: SqlDatabase): PhotoSummary[] => list_photos(database),

    get_body_photo: (database: SqlDatabase, id: string): BodyPhoto => get_photo(database, id),

    save_body_photo: (database: SqlDatabase, photo: PhotoInput): string => save_photo(database, photo),

    delete_body_photo: (database: SqlDatabase, id: string): void => {
      drizzle_of(database).delete(body_photos).where(eq(body_photos.id, id)).run();
    },
  },
  api: body_api,
  settings: settings_of(body_setting_defaults),
});
