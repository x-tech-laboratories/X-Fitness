// The Reports tab: every metric's latest reading and trend, several metrics compared by their change, one metric over a
// range as figures and a chart, and every logged day in the range.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { LineChart, Sparkline } from "@x-tech-laboratories/x-libs/web/react/charts";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, Cards, PageHeading, Section, Tile, Tiles, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { average_days, type BodyMetric } from "../../shared/body/readings.ts";
import type { BodyReport, HistoryDay } from "../../shared/body/store.ts";
import { use_data } from "../api.ts";
import { format_change, format_number, format_value, to_shown_value, unit_of, type ShownUnits } from "./format.ts";
import { today } from "./LogTab.tsx";

// ── Report ───────────────────────────────────────────────────────────────────

const epoch_of = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

// A chart's dates as the day they were logged, read in UTC so a time zone never moves them.
const day_of = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 10);

const compare_colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

const ranges: [days: number, label: string][] = [[30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"], [0, "All time"]];

function MetricReport({ report, units }: { report: BodyReport; units: ShownUnits }) {
  const { metric, stats } = report;
  if (!stats) return <p className="muted">{`No ${metric.name} readings in this range.`}</p>;
  const format = (value: number) => format_value(metric, value, units);
  const shown = (points: BodyReport["series"]) => points.map((point): [number, number] => [epoch_of(point.date), to_shown_value(metric, point.value, units)]);
  const unit = unit_of(metric, units);

  return (
    <div className="stack tight">
      <Tiles>
        <Tile label="Latest" value={<>{format(stats.latest.value)} <span className="muted small">{stats.latest.date}</span></>} />
        <Tile label="Change" value={format_change(metric, stats.change, units)} />
        <Tile label={`${average_days}-Day Average`} value={format(report.average.at(-1)?.value ?? stats.latest.value)} />
        <Tile label="Lowest" value={format(stats.lowest)} />
        <Tile label="Highest" value={format(stats.highest)} />
        <Tile label="Readings" value={String(stats.count)} />
        {metric.goal > 0 && <Tile label="Goal" value={format(metric.goal)} />}
        {report.to_go !== null && <Tile label="To Go" value={format_change(metric, report.to_go, units)} />}
        {report.bmi !== null && <Tile label="BMI" value={format_number(report.bmi)} />}
      </Tiles>
      <LineChart
        title={`${metric.name}${unit ? ` (${unit})` : ""}`}
        scale="fit"
        format_time={day_of}
        series={[
          { label: "Readings", color: "var(--series-1)", draw: "dots", points: shown(report.series) },
          ...(report.average.length > 1 ? [{ label: `${average_days}-day average`, color: "var(--series-2)", points: shown(report.average) }] : []),
        ]}
        limits={metric.goal > 0 ? [{ label: "Goal", value: to_shown_value(metric, metric.goal, units), color: "var(--status-success)" }] : []}
        format={(value) => `${format_number(value)} ${unit}`.trim()}
        empty_message="Nothing to plot yet."
      />
    </div>
  );
}

function history_columns(metrics: BodyMetric[], units: ShownUnits): TableColumn<HistoryDay>[] {
  return [
    { label: "Date", cell: (day) => day.date, width: 120, min_width: 120 },
    ...metrics.map((metric): TableColumn<HistoryDay> => {
      const unit = unit_of(metric, units);
      return {
        id: metric.id,
        label: `${metric.name}${unit ? ` (${unit})` : ""}`,
        cell: (day) => (day.values[metric.id] ? format_number(to_shown_value(metric, day.values[metric.id]!, units)) : ""),
      };
    }),
    { label: "Note", cell: (day) => day.comment, min_width: 220 },
  ];
}

// ── Every metric ─────────────────────────────────────────────────────────────

// A metric's readings oldest first, whatever order the history comes in.
export function readings_of(metric: BodyMetric, history: HistoryDay[]): [date: string, value: number][] {
  return history
    .filter((day) => day.values[metric.id] !== undefined)
    .map((day): [string, number] => [day.date, day.values[metric.id]!])
    .sort(([first], [second]) => first.localeCompare(second));
}

// A card per metric read in the range with its latest reading, its change and a sparkline; picking one reports on it.
function MetricCards({ metrics, history, units, on_pick }: { metrics: BodyMetric[]; history: HistoryDay[]; units: ShownUnits; on_pick: (id: string) => void }) {
  const read = metrics.map((metric) => ({ metric, readings: readings_of(metric, history) })).filter((item) => item.readings.length > 0);
  if (read.length === 0) return <p className="muted">Nothing logged in this range.</p>;
  return (
    <Cards>
      {read.map(({ metric, readings }) => {
        const [first, last] = [readings[0]!, readings.at(-1)!];
        return (
          <Card key={metric.id} title={metric.name} badge={<span className="muted small">{last[0]}</span>} on_click={() => on_pick(metric.id)}>
            <strong>{format_value(metric, last[1], units)}</strong>
            {readings.length > 1 && <span className="muted small">{` ${format_change(metric, last[1] - first[1], units)}`}</span>}
            <Sparkline scale="fit" top={0} color="var(--series-1)" label={`${metric.name} in this range`} points={readings.map(([date, value]): [number, number] => [epoch_of(date), to_shown_value(metric, value, units)])} />
          </Card>
        );
      })}
    </Cards>
  );
}

// Metrics in different units side by side, each as its change in percent from its first reading in the range.
function CompareChart({ metrics, history }: { metrics: BodyMetric[]; history: HistoryDay[] }) {
  const named = metrics.filter((metric) => readings_of(metric, history).length > 0);
  const [chosen, set_chosen] = useState<string[]>(() => named.slice(0, 2).map((metric) => metric.name));
  const shown = named.filter((metric) => chosen.includes(metric.name)).slice(0, compare_colors.length);
  return (
    <Section title="Compare">
      <ChipField label="Metrics to compare" values={chosen} suggestions={named.map((metric) => metric.name)} on_change={(names) => set_chosen(names.filter((name) => named.some((metric) => metric.name === name)))} placeholder="Add a metric…" />
      <LineChart
        title="Change since the start of the range (%)"
        scale="fit"
        format_time={day_of}
        series={shown.map((metric, index) => {
          const readings = readings_of(metric, history);
          const start = readings[0]![1];
          return { label: metric.name, color: compare_colors[index]!, points: readings.map(([date, value]): [number, number] => [epoch_of(date), start ? ((value - start) / start) * 100 : 0]) };
        })}
        format={(value) => `${value > 0 ? "+" : ""}${format_number(value)}%`}
        empty_message="Pick metrics with two or more readings in this range."
      />
    </Section>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function ReportsTab({ units }: { units: ShownUnits }) {
  const [chosen, set_chosen] = useState("");
  const [days, set_days] = useState(90);
  const metrics = use_data((api) => api.list_body_metrics());
  const history = use_data((api) => api.list_body_history(days, today()), [days]);

  return (
    <Loaded resource={metrics}>
      {(list) => {
        const metric = list.find((item) => item.id === chosen) ?? list[0];
        if (!metric) return <p className="muted">No metrics. Add some under Metrics.</p>;
        return (
          <div className="stack">
            <Toolbar>
              <Select label="Range" options={ranges} value={days} on_change={set_days} />
            </Toolbar>
            <Loaded resource={history}>
              {(rows) => (
                <>
                  <Section title="Every metric">
                    <MetricCards metrics={list} history={rows} units={units} on_pick={set_chosen} />
                  </Section>
                  <Section title={metric.name} tools={<Select label="Metric" bare options={list.map((item): [string, string] => [item.id, item.name])} value={metric.id} on_change={set_chosen} />}>
                    <MetricPanel metric_id={metric.id} days={days} units={units} />
                  </Section>
                  <CompareChart metrics={list} history={rows} />
                  <PageHeading level={2} title="History" />
                  {rows.length === 0 ? (
                    <p className="muted">Nothing logged in this range.</p>
                  ) : (
                    <DataTable caption="History" columns={history_columns(list, units)} rows={rows.map((row) => ({ ...row }))} row_key={(row) => row.date} wrap_class="scroll" />
                  )}
                </>
              )}
            </Loaded>
          </div>
        );
      }}
    </Loaded>
  );
}

function MetricPanel({ metric_id, days, units }: { metric_id: string; days: number; units: ShownUnits }) {
  const report = use_data((api) => api.get_body_report(metric_id, days, today()), [metric_id, days]);
  return <Loaded resource={report}>{(loaded) => <MetricReport report={loaded} units={units} />}</Loaded>;
}
