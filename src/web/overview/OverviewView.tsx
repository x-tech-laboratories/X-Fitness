// The Overview: today's eating against its targets, how training has gone these weeks, and each body metric's trend.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { BarChart, Meters, Sparkline, Strip } from "@x-tech-laboratories/x-libs/web/react/charts";
import { Card, Cards, PageHeading, Section, Stack, Tile, Tiles } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded, type Resource } from "@x-tech-laboratories/x-libs/web/react/states";

import type { BodyMetric } from "../../shared/body/readings.ts";
import type { HistoryDay, MetricSummary } from "../../shared/body/store.ts";
import type { DiaryDay } from "../../shared/diet/store.ts";
import type { WorkoutReport } from "../../shared/workouts/store.ts";
import { use_data, use_settings } from "../api.ts";
import { format_change, format_value, to_shown_value } from "../body/format.ts";
import { readings_of } from "../body/ReportsTab.tsx";
import { epoch_of } from "../dates.ts";
import { target_meters } from "../diet/DiaryTab.tsx";
import { format_nutrient } from "../diet/format.ts";
import { shown_units, type ShownUnits } from "../units.ts";
import { target_of } from "../../shared/diet/labels.ts";
import { nutrients, type NutrientKey } from "../../shared/diet/model.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

const weeks_shown = 8;
const days_shown = 28;
const body_days = 90;

// ── Diet ─────────────────────────────────────────────────────────────────────

function DietToday({ day, settings, energy }: { day: DiaryDay; settings: Record<string, unknown>; energy: EnergyUnit }) {
  return (
    <Section title="Eaten today" tools={<a href="#/diet/diary">Diary</a>}>
      {day.entries.length === 0 ? <Empty title="Nothing logged today." /> : <Meters rows={target_meters(day.totals, settings, energy, nutrients.filter((info) => info.group === "macros"))} message="Nothing tracked." />}
    </Section>
  );
}

// ── Training ─────────────────────────────────────────────────────────────────

function Training({ report, weekly_target }: { report: WorkoutReport; weekly_target: number }) {
  const recent = report.days.slice(-days_shown);
  return (
    <Section title="Training" tools={<a href="#/workouts/reports">Reports</a>}>
      <BarChart
        title={`Workouts per week, last ${weeks_shown} weeks`}
        format={(value) => String(Math.round(value))}
        bars={report.weeks.map((week) => ({ label: `Week of ${week.week_start}`, value: week.workouts, color: weekly_target > 0 && week.workouts >= weekly_target ? "var(--status-success)" : "var(--series-1)" }))}
      />
      <Strip title={`Days trained, last ${days_shown} days`} cells={recent.map((day) => ({ label: day.date, ok: day.workouts > 0 ? true : null }))} />
    </Section>
  );
}

// ── Body ─────────────────────────────────────────────────────────────────────

function MetricCard({ metric, history, units }: { metric: BodyMetric; history: HistoryDay[]; units: ShownUnits }) {
  const readings = readings_of(metric, history);
  const [first, last] = [readings[0], readings.at(-1)];
  if (!first || !last) return null;
  return (
    <Card title={metric.name} href="#/body/reports" badge={<span className="muted small">{last[0]}</span>}>
      <strong>{format_value(metric, last[1], units)}</strong>
      {readings.length > 1 && <span className="muted small">{` ${format_change(metric, last[1] - first[1], units)} in ${body_days} days`}</span>}
      <Sparkline scale="fit" top={0} color="var(--series-1)" label={`${metric.name} over ${body_days} days`} points={readings.map(([date, value]): [number, number] => [epoch_of(date), to_shown_value(metric, value, units)])} />
    </Card>
  );
}

function Body({ metrics, history, units }: { metrics: MetricSummary[]; history: HistoryDay[]; units: ShownUnits }) {
  const shown = metrics.filter((metric) => history.some((day) => day.values[metric.id] !== undefined));
  return (
    <Section title="Body" tools={<a href="#/body/log">Log</a>}>
      {shown.length === 0 ? (
        <Empty title={`No readings in the last ${body_days} days.`} />
      ) : (
        <Cards>
          {shown.map((metric) => <MetricCard key={metric.id} metric={metric} history={history} units={units} />)}
        </Cards>
      )}
    </Section>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

function Headline({ day, report, settings, energy, weekly_target }: { day: DiaryDay; report: WorkoutReport; settings: Record<string, unknown>; energy: EnergyUnit; weekly_target: number }) {
  const this_week = report.weeks.at(-1);
  const last_workout = report.days.findLast((item) => item.workouts > 0);
  // A nutrient eaten today, with its target after it when one is set.
  const eaten = (key: NutrientKey) => {
    const info = nutrients.find((item) => item.key === key)!;
    const target = target_of(settings, key);
    return `${format_nutrient(info, day.totals[key], energy)}${target > 0 ? ` / ${format_nutrient(info, target, energy)}` : ""}`;
  };
  return (
    <Tiles>
      <Tile label="Energy today" value={eaten("calories")} href="#/diet/diary" />
      <Tile label="Protein today" value={eaten("protein")} href="#/diet/diary" />
      <Tile
        label="Workouts this week"
        value={weekly_target > 0 ? `${this_week?.workouts ?? 0} / ${weekly_target}` : String(this_week?.workouts ?? 0)}
        tone={weekly_target > 0 && (this_week?.workouts ?? 0) >= weekly_target ? "good" : undefined}
        href="#/workouts/log"
      />
      <Tile label="Last workout" value={last_workout?.date ?? "—"} href="#/workouts/log" />
    </Tiles>
  );
}

export function OverviewView() {
  const date = today();
  const settings = use_settings();
  const day = use_data((api) => api.get_diary_day(date), [date]);
  const metrics = use_data((api) => api.list_body_metrics());
  const history = use_data((api) => api.list_body_history(body_days, date), [date]);

  return (
    <>
      <PageHeading title="Overview" subtitle="Today and the last few weeks across diet, training and body." />
      <Loaded resource={settings}>
        {(values) => <OverviewBody date={date} settings={values} day={day} metrics={metrics} history={history} />}
      </Loaded>
    </>
  );
}

interface OverviewBodyProps {
  date: string;
  settings: Record<string, unknown>;
  day: Resource<DiaryDay>;
  metrics: Resource<MetricSummary[]>;
  history: Resource<HistoryDay[]>;
}

function OverviewBody({ date, settings, day, metrics, history }: OverviewBodyProps) {
  const week_start = Number(settings.week_start ?? 1);
  const weekly_target = Number(settings["workouts.weekly_target"] ?? 0);
  const report = use_data((api) => api.get_workout_report({ weeks: weeks_shown, today: date, week_start }), [date, week_start]);
  const units = shown_units(settings);
  const energy = units.energy;

  return (
    <Loaded resource={report}>
      {(workouts) => (
        <Loaded resource={day}>
          {(eaten) => (
            <Stack>
              <Headline day={eaten} report={workouts} settings={settings} energy={energy} weekly_target={weekly_target} />
              <DietToday day={eaten} settings={settings} energy={energy} />
              {workouts.days.some((item) => item.workouts > 0) ? <Training report={workouts} weekly_target={weekly_target} /> : <Empty title="No workouts yet." hint="Log one under Workouts to see your training here." />}
              <Loaded resource={metrics}>{(list) => <Loaded resource={history}>{(days) => <Body metrics={list} history={days} units={units} />}</Loaded>}</Loaded>
            </Stack>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}
