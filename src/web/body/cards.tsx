// A metric's card as the Body reports and the Overview show it: its latest reading and day, its change over the range
// and a sparkline of its readings.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Sparkline } from "@x-tech-laboratories/x-libs/web/react/charts";
import { Card } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { BodyMetric } from "../../shared/body/readings.ts";
import type { HistoryDay } from "../../shared/body/store.ts";
import { epoch_of } from "../dates.ts";
import type { ShownUnits } from "../units.ts";
import { format_change, format_value, to_shown_value } from "./format.ts";

// ── Readings ─────────────────────────────────────────────────────────────────

// A metric's readings oldest first, whatever order the history comes in.
export function readings_of(metric: BodyMetric, history: HistoryDay[]): [date: string, value: number][] {
  return history
    .filter((day) => day.values[metric.id] !== undefined)
    .map((day): [string, number] => [day.date, day.values[metric.id]!])
    .sort(([first], [second]) => first.localeCompare(second));
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface MetricSparkCardProps {
  metric: BodyMetric;
  // The metric's readings oldest first, at least one.
  readings: [date: string, value: number][];
  units: ShownUnits;
  // The range the readings span, such as "in 90 days", after the change and in the sparkline's label.
  range: string;
  // Where the card leads, or what picking it does.
  href?: string;
  on_click?: () => void;
}

export function MetricSparkCard({ metric, readings, units, range, href, on_click }: MetricSparkCardProps) {
  const [first, last] = [readings[0]!, readings.at(-1)!];
  return (
    <Card title={metric.name} href={href} on_click={on_click} badge={<span className="muted small">{last[0]}</span>}>
      <strong>{format_value(metric, last[1], units)}</strong>
      {readings.length > 1 && <span className="muted small">{` ${format_change(metric, last[1] - first[1], units)} ${range}`}</span>}
      <Sparkline scale="fit" top={0} color="var(--series-1)" label={`${metric.name} ${range}`} points={readings.map(([date, value]): [number, number] => [epoch_of(date), to_shown_value(metric, value, units)])} />
    </Card>
  );
}
