// Reads the Trilium Body Metrics add-on's database.json, or a file exported here, into the body tables without
// wiping anything: metrics not already present are added, and on a day both hold, what is here is kept.

// ── Imports ──────────────────────────────────────────────────────────────────

import { in_transaction, type SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import { to_stored, type LengthUnit, type MassUnit } from "@x-tech-laboratories/x-libs/units";

import { is_day, kind_of, normalize_metric, positive_number, trimmed_text, type MetricKind } from "./readings.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

// The units the file's numbers are in, since the add-on only labelled them.
export interface ImportUnits {
  mass_unit?: MassUnit;
  length_unit?: LengthUnit;
}

export interface ImportResult {
  // What the file holds.
  metrics: number;
  days: number;
  // What was new here.
  added_metrics: number;
  added_readings: number;
}

interface FileMetric {
  id: string;
  name: string;
  kind: MetricKind;
  unit: string;
  goal: number;
  comment: string;
}

interface FileDay {
  values: Record<string, number>;
  comment: string;
}

// ── Reading the file ─────────────────────────────────────────────────────────

function as_record(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

// The add-on's own rules: a metric without an id is skipped, readings not above 0 are dropped, and an empty day is no day.
function read_file(text: string): { metrics: FileMetric[]; log: Map<string, FileDay>; units: Record<string, unknown> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(text).trim());
  } catch {
    throw new Error("Not valid JSON.");
  }
  const file = as_record(parsed);
  if (!file || !Array.isArray(file.metrics)) throw new Error("Expected a JSON object with metrics/log.");

  const metrics = file.metrics
    .map((raw) => as_record(raw) ?? {})
    .filter((raw) => trimmed_text(raw.id))
    .map((raw) => ({ id: trimmed_text(raw.id), ...normalize_metric(raw), unit: trimmed_text(raw.unit) }));

  const log = new Map<string, FileDay>();
  for (const [date, raw_day] of Object.entries(as_record(file.log) ?? {})) {
    const day = as_record(raw_day);
    if (!is_day(date) || !day) continue;
    const values: Record<string, number> = {};
    for (const [id, raw] of Object.entries(as_record(day.values) ?? {})) {
      const value = positive_number(raw);
      if (value > 0) values[id] = value;
    }
    const comment = trimmed_text(day.comment);
    if (Object.keys(values).length > 0 || comment) log.set(date, { values, comment });
  }
  return { metrics, log, units: as_record(file.units) ?? {} };
}

function setting_of(database: SqlDatabase, key: string): unknown {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : undefined;
}

// ── Import ───────────────────────────────────────────────────────────────────

// Numbers are read in the file's own units when it names them, else in the units given, else in the units set here.
export function import_trilium_body(database: SqlDatabase, json_text: string, units: ImportUnits = {}): ImportResult {
  const file = read_file(json_text);
  const mass_unit: MassUnit = file.units.weight === "lb" || file.units.weight === "kg" ? file.units.weight : units.mass_unit ?? (setting_of(database, "mass_unit") === "lb" ? "lb" : "kg");
  const length_unit: LengthUnit = file.units.length === "in" || file.units.length === "cm" ? file.units.length : units.length_unit ?? (setting_of(database, "length_unit") === "in" ? "in" : "cm");

  return in_transaction(database, () => {
    const known = new Map((database.prepare("SELECT id, kind FROM body_metrics").all() as { id: string; kind: string }[]).map((row) => [row.id, kind_of(row.kind)]));
    const kinds = new Map(known);
    for (const metric of file.metrics) if (!kinds.has(metric.id)) kinds.set(metric.id, metric.kind);
    const stored = (kind: MetricKind | undefined, value: number) =>
      kind === "weight" ? to_stored(value, mass_unit) : kind === "length" ? to_stored(value, length_unit) : value;

    let added_metrics = 0;
    const { next } = database.prepare("SELECT COALESCE(MAX(position) + 1, 0) AS next FROM body_metrics").get() as { next: number };
    const insert_metric = database.prepare("INSERT INTO body_metrics (id, name, kind, unit, goal, comment, position) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const metric of file.metrics) {
      if (known.has(metric.id)) continue;
      known.set(metric.id, metric.kind);
      const unit = metric.kind === "custom" ? metric.unit : "";
      insert_metric.run(metric.id, metric.name, metric.kind, unit, stored(metric.kind, metric.goal), metric.comment, next + added_metrics);
      added_metrics++;
    }

    let added_readings = 0;
    const insert_reading = database.prepare("INSERT INTO body_readings (metric_id, date, value) VALUES (?, ?, ?) ON CONFLICT (metric_id, date) DO NOTHING");
    const insert_note = database.prepare("INSERT INTO body_days (date, comment) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET comment = excluded.comment WHERE body_days.comment = ''");
    for (const [date, day] of file.log) {
      for (const [metric_id, value] of Object.entries(day.values)) {
        // A reading of a metric neither side knows has nowhere to show, as in the add-on.
        if (!known.has(metric_id)) continue;
        added_readings += Number(insert_reading.run(metric_id, date, stored(kinds.get(metric_id), value)).changes);
      }
      if (day.comment) insert_note.run(date, day.comment);
    }
    return { metrics: file.metrics.length, days: file.log.size, added_metrics, added_readings };
  });
}
