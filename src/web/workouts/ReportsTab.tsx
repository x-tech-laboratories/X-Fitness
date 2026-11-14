// What the log adds up to: totals per week against the weekly target, the days trained, sets per category, the leading
// exercises, one exercise's records, trend and history, and every exercise's personal best with its recent sessions.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { today as today_here } from "@x-tech-laboratories/x-libs/dates";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { Donut, LineChart, Sparkline } from "@x-tech-laboratories/x-libs/web/react/charts";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, Cards, Facts, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { measurement_of, type Exercise, type LoggedSet, type Measurement } from "../../shared/workouts/model.ts";
import type { ExerciseStats, TrendMetric, TrendPoint, WeekTotals } from "../../shared/workouts/reports.ts";
import type { WorkoutLibrary } from "../../shared/workouts/store.ts";
import { use_data } from "../api.ts";
import { epoch_of } from "../dates.ts";
import type { ShownUnits } from "../units.ts";
import { ExerciseSelect } from "./controls.tsx";
import { field_to_shown, format_field, format_weight } from "./units.ts";
import { format_metric, meets_target, week_metrics, WeeklyWorkoutsChart, type FigureKind, type WeekMetric } from "./weekly_chart.tsx";

// ── Wording ──────────────────────────────────────────────────────────────────

const ranges = [8, 12, 26, 52];

// Which curves are worth drawing follows how the exercise is measured.
function trend_metrics(measurement: Measurement): { key: TrendMetric; label: string; kind: FigureKind; suffix?: string }[] {
  switch (measurement) {
    case "weight":
      return [
        { key: "top_weight", label: "Top Set", kind: "weight" },
        { key: "one_rep_max", label: "Est. 1RM", kind: "weight" },
        { key: "volume", label: "Session Volume", kind: "weight" },
        { key: "reps", label: "Total Reps", kind: "count", suffix: "reps" },
        { key: "sets", label: "Sets", kind: "count", suffix: "sets" },
      ];
    case "bodyweight":
      return [
        { key: "top_reps", label: "Best Set", kind: "count", suffix: "reps" },
        { key: "reps", label: "Total Reps", kind: "count", suffix: "reps" },
        { key: "sets", label: "Sets", kind: "count", suffix: "sets" },
      ];
    case "duration":
      return [
        { key: "duration", label: "Total Duration", kind: "duration" },
        { key: "sets", label: "Sets", kind: "count", suffix: "sets" },
      ];
    case "cardio":
      return [
        { key: "distance", label: "Distance", kind: "distance" },
        { key: "duration", label: "Duration", kind: "duration" },
        { key: "sets", label: "Sets", kind: "count", suffix: "sets" },
      ];
  }
}

// The records worth calling out for one exercise, led by its measurement.
function highlights(measurement: Measurement, stats: ExerciseStats, units: ShownUnits): [string, string][] {
  const totals: [string, string][] = [
    ["Sessions", format_number(stats.workouts)],
    ["Total Sets", format_number(stats.sets)],
    ["Last Done", stats.last_done ?? "—"],
  ];
  switch (measurement) {
    case "weight":
      return [
        ["Best Weight", format_weight(stats.best_weight, units)],
        ["Best Est. 1RM", format_weight(stats.best_one_rep_max, units)],
        ["Best Set Volume", format_weight(stats.best_set_volume, units)],
        ["Most Reps In A Set", format_number(stats.best_reps)],
        ["Total Volume", format_weight(stats.total_volume, units)],
        ...totals,
      ];
    case "bodyweight":
      return [["Most Reps In A Set", format_number(stats.best_reps)], ["Total Reps", format_number(stats.total_reps)], ...totals];
    case "duration":
      return [["Longest Set", format_field("duration", stats.best_duration, units)], ...totals];
    case "cardio":
      return [["Furthest", format_field("distance", stats.best_distance, units)], ["Longest", format_field("duration", stats.best_duration, units)], ...totals];
  }
}

// The best that means something for the measurement, such as "100 kg · est. 1RM 116.7 kg".
export function best_label(measurement: Measurement, stats: ExerciseStats, units: ShownUnits): string {
  switch (measurement) {
    case "weight":
      return stats.best_weight > 0 ? `${format_weight(stats.best_weight, units)} · est. 1RM ${format_weight(stats.best_one_rep_max, units)}` : "—";
    case "bodyweight":
      return stats.best_reps > 0 ? `${format_number(stats.best_reps)} reps` : "—";
    case "duration":
      return stats.best_duration > 0 ? format_field("duration", stats.best_duration, units) : "—";
    case "cardio":
      return [stats.best_distance > 0 ? format_field("distance", stats.best_distance, units) : "", stats.best_duration > 0 ? format_field("duration", stats.best_duration, units) : ""].filter(Boolean).join(" · ") || "—";
  }
}

// One logged set as its exercise is measured, such as "5 reps × 60 kg × RPE 8".
function set_label(set: LoggedSet, measurement: Measurement, units: ShownUnits): string {
  const parts = measurement_of(measurement)
    .fields.filter((field) => set[field] > 0)
    .map((field) => format_field(field, set[field], units));
  if (set.rpe > 0) parts.push(`RPE ${format_number(set.rpe)}`);
  return parts.join(" × ") || "—";
}

// The figure a sparkline follows for the measurement, the same one its Best column leads with.
const spark_metrics: Record<Measurement, TrendMetric> = { weight: "one_rep_max", bodyweight: "top_reps", duration: "duration", cardio: "distance" };

const category_colors = ["var(--series-1)", "var(--series-2)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

// The biggest categories each get a slice and the rest share a grey one, so the ring stays readable.
function category_parts(categories: { category: string; sets: number }[]) {
  const shown = categories.length > category_colors.length + 1 ? categories.slice(0, category_colors.length) : categories.slice(0, category_colors.length + 1);
  const rest = categories.slice(shown.length).reduce((sum, item) => sum + item.sets, 0);
  const parts = shown.map((item, index) => ({ label: item.category || "Uncategorised", value: item.sets, color: category_colors[index] ?? "var(--series-3)" }));
  return rest > 0 ? [...parts, { label: "Other", value: rest, color: "var(--series-3)" }] : parts;
}

// ── Per exercise ─────────────────────────────────────────────────────────────

function ExerciseReportPanel({ exercise_id, units }: { exercise_id: string; units: ShownUnits }) {
  const report = use_data((api) => api.get_exercise_report(exercise_id), [exercise_id]);
  const [metric_key, set_metric_key] = useState<TrendMetric | "">("");
  return (
    <Loaded resource={report}>
      {(data) => {
        if (!data) return <Empty title="That exercise is gone." />;
        const metrics = trend_metrics(data.exercise.measurement);
        // The curve falls back to the first when the measurement no longer offers the one chosen.
        const metric = metrics.find((item) => item.key === metric_key) ?? metrics[0]!;
        const format = (value: number) => format_metric(metric.kind, value, units, metric.suffix);
        return (
          <Card title={data.exercise.name} badge={<span className="muted small">{measurement_of(data.exercise.measurement).label}</span>}>
            <Facts rows={highlights(data.exercise.measurement, data.stats, units)} />
            {metrics.length > 1 && <Select<TrendMetric> label="Chart" options={metrics.map((item) => [item.key, item.label])} value={metric.key} on_change={set_metric_key} />}
            <LineChart
              title={`${metric.label} per session`}
              format={format}
              series={[{ label: metric.label, color: "var(--series-1)", points: data.trend.map((point): [number, number] => [epoch_of(point.date), point[metric.key]]) }]}
            />
            {data.history.length === 0 ? (
              <Empty title="Not done yet." />
            ) : (
              <ul className="close-list" aria-label="History">
                {data.history.map((record, index) => (
                  <li key={`${record.workout_id}-${index}`}>
                    <strong>{record.date}</strong>
                    {` — ${record.sets.map((set) => set_label(set, data.exercise.measurement, units)).join(", ") || "no sets"}`}
                    {record.notes && ` · ${record.notes}`}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      }}
    </Loaded>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

interface ReportsTabProps {
  library: WorkoutLibrary;
  units: ShownUnits;
  weekly_target: number;
  week_start: number;
  // The day weeks are counted back from; today unless set.
  today?: string;
}

export function ReportsTab({ library, units, weekly_target, week_start, today }: ReportsTabProps) {
  const [weeks, set_weeks] = useState(12);
  const [week_metric, set_week_metric] = useState<WeekMetric>("volume");
  const [exercise_id, set_exercise_id] = useState("");
  const day = today ?? today_here();
  const report = use_data((api) => api.get_workout_report({ weeks, today: day, week_start }), [weeks, day, week_start]);
  const metric = week_metrics.find((item) => item.key === week_metric)!;

  function open_exercise(id: string): void {
    set_exercise_id(id);
    document.getElementById("workouts-per-exercise")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  const week_columns: TableColumn<WeekTotals>[] = [
    { label: "Week of", cell: (week) => week.week_start },
    { label: "Workouts", cell: (week) => <span className={meets_target(week.workouts, weekly_target) ? "tone-good" : undefined}>{`${week.workouts} / ${weekly_target}`}</span> },
    { label: "Sets", cell: (week) => week.sets },
    { label: `Volume (${units.mass})`, cell: (week) => format_number(field_to_shown("weight", week.volume, units)) },
    { label: "Duration (min)", cell: (week) => format_number(week.duration / 60) },
    { label: `Distance (${units.distance})`, cell: (week) => format_number(field_to_shown("distance", week.distance, units)) },
  ];

  type Best = { exercise: Exercise; stats: ExerciseStats; trend: TrendPoint[] };
  const best_columns: TableColumn<Best>[] = [
    { label: "Exercise", cell: (row) => row.exercise.name },
    { label: "Best", cell: (row) => best_label(row.exercise.measurement, row.stats, units) },
    {
      label: "Recent",
      id: "recent",
      cell: (row) => {
        const key = spark_metrics[row.exercise.measurement];
        return <Sparkline scale="fit" top={0} color="var(--series-1)" label={`${row.exercise.name}, last ${row.trend.length} sessions`} points={row.trend.map((point): [number, number] => [epoch_of(point.date), point[key]])} />;
      },
    },
    { label: "Sets", cell: (row) => row.stats.sets },
    { label: `Volume (${units.mass})`, cell: (row) => (row.stats.total_volume > 0 ? format_number(field_to_shown("weight", row.stats.total_volume, units)) : "—") },
    { label: "Last done", cell: (row) => row.stats.last_done },
    {
      label: "",
      id: "actions",
      class: "actions-cell",
      cell: (row) => (
        <button type="button" onClick={() => open_exercise(row.exercise.id)} aria-label={`Report on ${row.exercise.name}`}>
          Report
        </button>
      ),
    },
  ];

  return (
    <Loaded resource={report}>
      {(data) => (
        <Stack>
          <Section
            title="Weekly Totals"
            tools={
              <>
                <Select<WeekMetric> label="Weekly metric" bare options={week_metrics.map((item) => [item.key, item.label])} value={week_metric} on_change={set_week_metric} />
                <Select<number> label="Weeks shown" bare options={ranges.map((count) => [count, `${count} weeks`])} value={weeks} on_change={set_weeks} />
              </>
            }
          >
            <WeeklyWorkoutsChart
              weeks={data.weeks}
              days={data.days}
              weekly_target={weekly_target}
              units={units}
              metric={week_metric}
              title={`${metric.label} per week`}
              strip_title="Days trained"
            />
            <DataTable columns={week_columns} rows={[...data.weeks].reverse()} row_key={(week) => week.week_start} />
          </Section>

          <Section title="Sets Per Category">
            <Donut
              title={`Sets per category, last ${weeks} weeks`}
              parts={category_parts(data.categories)}
              center={String(data.categories.reduce((sum, item) => sum + item.sets, 0))}
              center_label="sets"
              message="No sets logged in these weeks."
            />
          </Section>

          <Section title="Leaders">
            <Cards>
              {data.leaders.map((board) => (
                <Card key={board.key} title={board.label}>
                  {board.rows.length === 0 ? (
                    <p className="muted small">Nothing ranked yet.</p>
                  ) : (
                    <ol className="close-list workouts-board">
                      {board.rows.map((row) => (
                        <li key={row.exercise_id}>
                          <button type="button" className="workouts-link" onClick={() => open_exercise(row.exercise_id)}>
                            {row.name}
                          </button>
                          <span className="muted small">{board.kind === "weight" ? format_weight(row.value, units) : `${format_number(row.value)} ${board.kind}`}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              ))}
            </Cards>
          </Section>

          <section id="workouts-per-exercise">
            <Section title="Per Exercise" tools={<ExerciseSelect label="Exercise to report on" exercises={library.exercises} categories={library.categories} value={exercise_id} placeholder="Pick an exercise…" on_change={set_exercise_id} />}>
              {exercise_id ? <ExerciseReportPanel key={exercise_id} exercise_id={exercise_id} units={units} /> : <Empty title="Pick an exercise to see its records and progress." />}
            </Section>
          </section>

          <Section title="Personal Bests">
            {data.bests.length === 0 ? <Empty title="Nothing logged yet." /> : <DataTable columns={best_columns} rows={data.bests} row_key={(row) => row.exercise.id} />}
          </Section>
        </Stack>
      )}
    </Loaded>
  );
}
