// The Overview: today's eating against its targets, how training has gone these weeks, energy eaten against energy
// burned beside the weight, and each body metric's trend.

// ── Imports ──────────────────────────────────────────────────────────────────

import { shift_day, today } from "@x-tech-laboratories/x-libs/dates";
import { format_number, to_shown, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { DonutTile, LineChart, Meters } from "@x-tech-laboratories/x-libs/web/react/charts";
import { Cards, PageHeading, Section, Stack, Tile, Tiles } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded, type Resource } from "@x-tech-laboratories/x-libs/web/react/states";

import type { HistoryDay, MetricSummary } from "../../shared/body/store.ts";
import type { CalculationsReport, WorkoutEnergy } from "../../shared/calculators/store.ts";
import { nutrients } from "../../shared/diet/model.ts";
import type { DayTotals, DiaryDay } from "../../shared/diet/store.ts";
import type { WorkoutReport } from "../../shared/workouts/store.ts";
import { use_data, use_settings } from "../api.ts";
import { MetricSparkCard, readings_of } from "../body/cards.tsx";
import { to_shown_value } from "../body/format.ts";
import { day_of, epoch_of } from "../dates.ts";
import { MacroDonut } from "../diet/macros.tsx";
import { target_meters } from "../diet/targets.ts";
import { shown_units, type ShownUnits } from "../units.ts";
import { meets_target, WeeklyWorkoutsChart } from "../workouts/weekly_chart.tsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

const weeks_shown = 8;
const days_shown = 28;
const body_days = 90;
const balance_days = 30;

// ── Diet ─────────────────────────────────────────────────────────────────────

function DietToday({ day, settings, energy }: { day: DiaryDay; settings: Record<string, unknown>; energy: EnergyUnit }) {
  return (
    <Section title="Eaten today" tools={<><a href="#/diet/diary">Diary</a> <a href="#/diet/reports">Reports</a></>}>
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

// ── Energy and weight ────────────────────────────────────────────────────────

// The energy burned a day the diet targets start from: measured from the diary when Goals says so and there is enough of it.
export function burned_a_day(report: CalculationsReport): number | null {
  return report.energy_source === "measured" && report.measured ? report.measured.tdee : report.calculations.tdee;
}

// Each day's workout energy added up, leaving out workouts with no weight to work it out from.
export function workout_energy_by_day(workouts: WorkoutEnergy[]): [date: string, kcal: number][] {
  const by_day = new Map<string, number>();
  for (const workout of workouts) if (workout.calories !== null) by_day.set(workout.date, (by_day.get(workout.date) ?? 0) + workout.calories);
  return [...by_day].sort(([first], [second]) => first.localeCompare(second));
}

interface EnergyAndWeightProps {
  date: string;
  metrics: MetricSummary[];
  history: HistoryDay[];
  units: ShownUnits;
}

// The last days' eating, workouts and energy burned a day, loaded for the charts below.
function EnergyAndWeight({ date, metrics, history, units }: EnergyAndWeightProps) {
  const from = shift_day(date, 1 - balance_days);
  const eaten = use_data((api) => api.list_daily_totals(from, date), [from, date]);
  const workouts = use_data((api) => api.list_workout_energy(from, date), [from, date]);
  const calculations = use_data((api) => api.get_calculations(date), [date]);
  return (
    <Loaded resource={eaten}>
      {(days) => (
        <Loaded resource={workouts}>
          {(sessions) => (
            <Loaded resource={calculations}>
              {(report) => <EnergyAndWeightCharts eaten={days} workouts={sessions} burned={burned_a_day(report)} metrics={metrics} history={history} from={from} units={units} />}
            </Loaded>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}

interface EnergyAndWeightChartsProps {
  eaten: DayTotals[];
  workouts: WorkoutEnergy[];
  burned: number | null;
  metrics: MetricSummary[];
  history: HistoryDay[];
  from: string;
  units: ShownUnits;
}

// Energy eaten each day against the energy burned a day and in workouts, above the weight over the same days.
function EnergyAndWeightCharts({ eaten, workouts, burned, metrics, history, from, units }: EnergyAndWeightChartsProps) {
  const energy = units.energy;
  const weight = metrics.find((metric) => metric.kind === "weight");
  const weighed = weight ? readings_of(weight, history).filter(([date]) => date >= from) : [];
  return (
    <Section title={`Energy and weight, last ${balance_days} days`} tools={<><a href="#/diet/reports">Diet</a> <a href="#/body/reports">Body</a></>}>
      <Stack>
        <LineChart
          title={`Energy per day (${energy})`}
          format_time={day_of}
          series={[
            { label: "Eaten", color: "var(--series-1)", points: eaten.map((day) => [epoch_of(day.date), day.entries ? to_shown(day.totals.calories, energy) : null]) },
            { label: "Burned in workouts", color: "var(--series-2)", draw: "dots", points: workout_energy_by_day(workouts).map(([date, kcal]) => [epoch_of(date), to_shown(kcal, energy)]) },
          ]}
          limits={burned !== null ? [{ label: "Burned a day", value: to_shown(burned, energy), color: "var(--status-danger)" }] : []}
          format={(value) => `${Math.round(value).toLocaleString()} ${energy}`}
          empty_message="Log meals in the Diary to compare them with what you burn."
        />
        {weight && (
          <LineChart
            title={`${weight.name} (${units.mass})`}
            scale="fit"
            format_time={day_of}
            series={[{ label: weight.name, color: "var(--series-3)", points: weighed.map(([date, value]) => [epoch_of(date), to_shown_value(weight, value, units)]) }]}
            format={(value) => `${format_number(value)} ${units.mass}`}
            empty_message={`Weigh in on Metrics twice in ${balance_days} days to see the trend beside what you eat.`}
          />
        )}
      </Stack>
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
              <DietToday day={eaten} settings={settings} energy={energy} />
              <Workouts report={workouts} weekly_target={weekly_target} />
              {workouts.days.some((item) => item.workouts > 0) ? <Training report={workouts} weekly_target={weekly_target} units={units} /> : <Empty title="No workouts yet." hint="Log one under Workouts to see your training here." />}
              <Loaded resource={metrics}>
                {(list) => (
                  <Loaded resource={history}>
                    {(days) => (
                      <>
                        <EnergyAndWeight date={date} metrics={list} history={days} units={units} />
                        <Body metrics={list} history={days} units={units} />
                      </>
                    )}
                  </Loaded>
                )}
              </Loaded>
            </Stack>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}
