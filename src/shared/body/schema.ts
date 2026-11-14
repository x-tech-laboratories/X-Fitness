// The body tables, from which drizzle-kit writes the migrations and the store reads its row types.

// ── Imports ──────────────────────────────────────────────────────────────────

import { index, integer, primaryKey, real, sqliteTable, text } from "@x-tech-laboratories/x-libs/drizzle";

// ── Tables ───────────────────────────────────────────────────────────────────

export const body_metrics = sqliteTable("body_metrics", {
  id: text().primaryKey(),
  name: text().notNull(),
  kind: text().notNull(),
  unit: text().notNull().default(""),
  comment: text().notNull().default(""),
  position: integer().notNull().default(0),
  // What the metric stands for, such as "waist" or "skinfold_thigh"; empty for nothing.
  role: text().notNull().default(""),
});

export const body_readings = sqliteTable(
  "body_readings",
  {
    metric_id: text()
      .notNull()
      .references(() => body_metrics.id, { onDelete: "cascade" }),
    date: text().notNull(),
    value: real().notNull(),
  },
  (table) => [primaryKey({ columns: [table.metric_id, table.date] }), index("body_readings_by_date").on(table.date)],
);

export const body_days = sqliteTable("body_days", {
  date: text().primaryKey(),
  comment: text().notNull(),
});

// One goal per thing it is about: weight, body_fat or a girth such as waist, in kg, percent or cm; no metric is needed.
export const body_goals = sqliteTable("body_goals", {
  key: text().primaryKey(),
  value: real().notNull(),
});

// Parents first, as sync applies them.
export const body_tables = [body_metrics, body_readings, body_days, body_goals];
