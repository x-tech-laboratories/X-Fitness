// The weekly totals the Workouts reports and the Overview chart: a bar per week, green where the workouts reached the
// weekly target, over a strip of the days trained.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_number } from "@x-tech-laboratories/x-libs/units";
import { BarChart, Strip } from "@x-tech-laboratories/x-libs/web/react/charts";

import type { DayActivity, WeekTotals } from "../../shared/workouts/reports.ts";
import type { ShownUnits } from "../units.ts";
import { format_field } from "./units.ts";

// ── Wording ──────────────────────────────────────────────────────────────────

export type FigureKind = "weight" | "distance" | "duration" | "count";

// A week's total or a trend point's value, converted and with its unit.
export function format_metric(kind: FigureKind, value: number, units: ShownUnits, suffix = ""): string {
  if (kind !== "count") return format_field(kind, value, units);
  return `${format_number(value)}${suffix ? ` ${suffix}` : ""}`;
}

export type WeekMetric = "volume" | "sets" | "workouts" | "duration" | "distance";

export const week_metrics: { key: WeekMetric; label: string; kind: FigureKind; suffix?: string }[] = [
  { key: "volume", label: "Volume", kind: "weight" },
  { key: "sets", label: "Sets", kind: "count", suffix: "sets" },
  { key: "workouts", label: "Workouts", kind: "count", suffix: "workouts" },
  { key: "duration", label: "Duration", kind: "duration" },
  { key: "distance", label: "Distance", kind: "distance" },
];

// Whether a week's workouts reached the target; with no target set, no week does.
export function meets_target(workouts: number, weekly_target: number): boolean {
  return weekly_target > 0 && workouts >= weekly_target;
}

// ── Chart ────────────────────────────────────────────────────────────────────

interface WeeklyWorkoutsChartProps {
  weeks: WeekTotals[];
  days: DayActivity[];
  weekly_target: number;
  units: ShownUnits;
  // The total each bar shows; workouts unless set.
  metric?: WeekMetric;
  title: string;
  strip_title: string;
}

export function WeeklyWorkoutsChart({ weeks, days, weekly_target, units, metric = "workouts", title, strip_title }: WeeklyWorkoutsChartProps) {
  const shown = week_metrics.find((item) => item.key === metric)!;
  return (
    <>
      <BarChart
        title={title}
        format={(value) => format_metric(shown.kind, value, units, shown.suffix)}
        bars={weeks.map((week) => ({ label: `Week of ${week.week_start}`, value: week[metric], color: metric === "workouts" && meets_target(week.workouts, weekly_target) ? "var(--status-success)" : "var(--series-1)" }))}
      />
      <Strip title={strip_title} cells={days.map((day) => ({ label: `${day.date}: ${day.workouts ? `${day.sets} sets` : "rest"}`, ok: day.workouts > 0 ? true : null }))} />
    </>
  );
}
