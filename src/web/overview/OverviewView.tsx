// The Overview: what to do next, today's eating against its targets, how training has gone these weeks, and each body metric's trend.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { DonutTile, Meters } from "@x-tech-laboratories/x-libs/web/react/charts";
import { Cards, PageHeading, Section, Stack, Tile, Tiles } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded, type Resource } from "@x-tech-laboratories/x-libs/web/react/states";

import type { HistoryDay, MetricSummary } from "../../shared/body/store.ts";
import { nutrients } from "../../shared/diet/model.ts";
import type { DiaryDay } from "../../shared/diet/store.ts";
import type { WorkoutReport } from "../../shared/workouts/store.ts";
import { use_data, use_settings } from "../api.ts";
import { MetricSparkCard, readings_of } from "../body/cards.tsx";
import { MacroDonut } from "../diet/macros.tsx";
import { target_meters } from "../diet/targets.ts";
import { shown_units, type ShownUnits } from "../units.ts";
import { meets_target, WeeklyWorkoutsChart } from "../workouts/weekly_chart.tsx";
import { NextActions } from "./NextActions.tsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

const weeks_shown = 8;
const days_shown = 28;
const body_days = 90;

// ── Diet ─────────────────────────────────────────────────────────────────────

function DietToday({ day, settings, energy }: { day: DiaryDay; settings: Record<string, unknown>; energy: EnergyUnit }) {
  return (
    <Section title="Eaten today" tools={<a href="#/diet/diary">Diary</a>}>
      {day.entries.length === 0 ? (
        <Empty title="Nothing logged today." />
      ) : (
        <Stack>
          <MacroDonut totals={day.totals} energy={energy} title="Energy from each macro" center_label={energy} message="No macros logged today." />
          <Meters rows={target_meters(day.totals, settings, energy, nutrients.filter((info) => info.group === "macros"))} message="Nothing tracked." />
        </Stack>
      )}
    </Section>
  );
}

// ── Training ─────────────────────────────────────────────────────────────────

function Training({ report, weekly_target, units }: { report: WorkoutReport; weekly_target: number; units: ShownUnits }) {
  return (
    <Section title="Training" tools={<a href="#/workouts/reports">Reports</a>}>
      <WeeklyWorkoutsChart
        weeks={report.weeks}
        days={report.days.slice(-days_shown)}
        weekly_target={weekly_target}
        units={units}
        title={`Workouts per week, last ${weeks_shown} weeks`}
        strip_title={`Days trained, last ${days_shown} days`}
      />
    </Section>
  );
}

// ── Body ─────────────────────────────────────────────────────────────────────

function Body({ metrics, history, units }: { metrics: MetricSummary[]; history: HistoryDay[]; units: ShownUnits }) {
  const shown = metrics.filter((metric) => history.some((day) => day.values[metric.id] !== undefined));
  return (
    <Section title="Body" tools={<a href="#/body/metrics">Metrics</a>}>
      {shown.length === 0 ? (
        <Empty title={`No readings in the last ${body_days} days.`} />
      ) : (
        <Cards>
          {shown.map((metric) => (
            <MetricSparkCard key={metric.id} metric={metric} readings={readings_of(metric, history)} units={units} range={`in ${body_days} days`} href="#/body/reports" />
          ))}
        </Cards>
      )}
    </Section>
  );
}

// This week's workouts against the weekly target, and the day of the last one.
function Workouts({ report, weekly_target }: { report: WorkoutReport; weekly_target: number }) {
  const this_week = report.weeks.at(-1)?.workouts ?? 0;
  const last_workout = report.days.findLast((item) => item.workouts > 0);
  return (
    <Section title="Workouts" tools={<a href="#/workouts/log">Log</a>}>
      <Tiles>
        {weekly_target > 0 ? (
          <DonutTile
            label="Workouts this week"
            value_text={String(this_week)}
            caption={`of ${weekly_target}`}
            percent={Math.min(100, (this_week / weekly_target) * 100)}
            color={meets_target(this_week, weekly_target) ? "var(--status-success)" : "var(--accent)"}
            href="#/workouts/log"
          />
        ) : (
          <Tile label="Workouts this week" value={String(this_week)} href="#/workouts/log" />
        )}
        <Tile label="Last workout" value={last_workout?.date ?? "—"} href="#/workouts/log" />
      </Tiles>
    </Section>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

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
              <NextActions />
              <DietToday day={eaten} settings={settings} energy={energy} />
              <Workouts report={workouts} weekly_target={weekly_target} />
              {workouts.days.some((item) => item.workouts > 0) ? <Training report={workouts} weekly_target={weekly_target} units={units} /> : <Empty title="No workouts yet." hint="Log one under Workouts to see your training here." />}
              <Loaded resource={metrics}>{(list) => <Loaded resource={history}>{(days) => <Body metrics={list} history={days} units={units} />}</Loaded>}</Loaded>
            </Stack>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}
