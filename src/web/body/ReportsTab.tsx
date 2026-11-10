// The Reports tab: one metric over a range as figures and a trend chart, and every logged day in the range.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PageHeading, Tile, Tiles, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { average_days, type BodyMetric } from "../../shared/body/readings.ts";
import type { BodyReport, HistoryDay } from "../../shared/body/store.ts";
import { use_data } from "../api.ts";
import { format_change, format_number, format_value, to_shown_value, unit_of, type ShownUnits } from "./format.ts";
import { today } from "./LogTab.tsx";
import { TrendChart } from "./TrendChart.tsx";

// ── Report ───────────────────────────────────────────────────────────────────

const ranges: [days: number, label: string][] = [[30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"], [0, "All time"]];

function MetricReport({ report, units }: { report: BodyReport; units: ShownUnits }) {
  const { metric, stats } = report;
  if (!stats) return <p className="muted">{`No ${metric.name} readings in this range.`}</p>;
  const format = (value: number) => format_value(metric, value, units);
  const shown = (points: BodyReport["series"]) => points.map((point) => ({ date: point.date, value: to_shown_value(metric, point.value, units) }));
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
      <TrendChart
        title={`${metric.name}${unit ? ` (${unit})` : ""}`}
        points={shown(report.series)}
        average={shown(report.average)}
        goal={metric.goal > 0 ? to_shown_value(metric, metric.goal, units) : 0}
        format={(value) => `${format_number(value)} ${unit}`.trim()}
        labels={{ points: "Readings", average: `${average_days}-day average`, goal: "Goal" }}
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

export function ReportsTab({ units }: { units: ShownUnits }) {
  const [chosen, set_chosen] = useState("");
  const [days, set_days] = useState(90);
  const metrics = use_data((api) => api.list_body_metrics());

  return (
    <Loaded resource={metrics}>
      {(list) => {
        const metric = list.find((item) => item.id === chosen) ?? list[0];
        if (!metric) return <p className="muted">No metrics. Add some in the Metrics tab.</p>;
        return (
          <div className="stack">
            <Toolbar>
              <Select label="Metric" options={list.map((item): [string, string] => [item.id, item.name])} value={metric.id} on_change={set_chosen} />
              <Select label="Range" options={ranges} value={days} on_change={set_days} />
            </Toolbar>
            <ReportBody metric_id={metric.id} metrics={list} days={days} units={units} />
          </div>
        );
      }}
    </Loaded>
  );
}

function ReportBody({ metric_id, metrics, days, units }: { metric_id: string; metrics: BodyMetric[]; days: number; units: ShownUnits }) {
  const report = use_data((api) => api.get_body_report(metric_id, days, today()), [metric_id, days]);
  const history = use_data((api) => api.list_body_history(days, today()), [days]);

  return (
    <>
      <Loaded resource={report}>{(loaded) => <MetricReport report={loaded} units={units} />}</Loaded>
      <PageHeading level={2} title="History" />
      <Loaded resource={history}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="muted">Nothing logged in this range.</p>
          ) : (
            <DataTable caption="History" columns={history_columns(metrics, units)} rows={rows.map((row) => ({ ...row }))} row_key={(row) => row.date} wrap_class="scroll" />
          )
        }
      </Loaded>
    </>
  );
}
