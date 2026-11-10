// Readings over real time as dots, their moving average as a line and a goal as a dashed rule, in the markup of X-Libs'
// charts. Unlike LineChart it plots a single reading, and its scale hugs the readings rather than starting at zero, so
// a slow change such as a kilo a month still shows.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { CSSProperties } from "react";

// ── Chart ────────────────────────────────────────────────────────────────────

export interface TrendPoint {
  // A local day such as "2026-11-10".
  date: string;
  value: number;
}

interface TrendChartProps {
  title: string;
  points: TrendPoint[];
  average: TrendPoint[];
  // Drawn when above 0.
  goal: number;
  format: (value: number) => string;
  labels?: { points: string; average: string; goal: string };
}

const width = 600;
const height = 180;
const margin = { left: 64, right: 8, top: 8, bottom: 20 };
const colors = { points: "var(--series-1)", average: "var(--series-2)", goal: "var(--status-success)" };

function day_number(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86400000;
}

export function TrendChart({ title, points, average, goal, format, labels = { points: "Readings", average: "Average", goal: "Goal" } }: TrendChartProps) {
  const legend: [string, string][] = [[labels.points, colors.points], ...(average.length > 1 ? [[labels.average, colors.average] as [string, string]] : []), ...(goal > 0 ? [[labels.goal, colors.goal] as [string, string]] : [])];
  const first_point = points[0];
  const last_point = points.at(-1);
  if (!first_point || !last_point) {
    return <figure className="chart"><figcaption>{title}</figcaption><p className="muted">Nothing to plot yet.</p></figure>;
  }

  const values = [...points.map((point) => point.value), ...(goal > 0 ? [goal] : [])];
  const [lowest, highest] = [Math.min(...values), Math.max(...values)];
  // A series that never moves has no span to scale by, so one is made up.
  const pad = (highest - lowest) * 0.15 || Math.max(highest * 0.05, 1);
  const [low, high] = [Math.max(0, lowest - pad), highest + pad];
  const first = day_number(first_point.date);
  const span = day_number(last_point.date) - first;
  const inner_width = width - margin.left - margin.right;
  const inner_height = height - margin.top - margin.bottom;
  const x = (date: string) => margin.left + (span === 0 ? inner_width / 2 : ((day_number(date) - first) / span) * inner_width);
  const y = (value: number) => margin.top + inner_height - ((value - low) / (high - low)) * inner_height;

  return (
    <figure className="chart">
      <figcaption>
        {title}
        {legend.map(([text, color]) => <span key={text} className="legend" style={{ "--swatch": color } as CSSProperties}>{text}</span>)}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} className="axis" />
        <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="axis" />
        <Tick x={margin.left - 6} y={margin.top + 4} text={format(high)} anchor="end" />
        <Tick x={margin.left - 6} y={height - margin.bottom} text={format(low)} anchor="end" />
        <Tick x={margin.left} y={height - 4} text={first_point.date} anchor="start" />
        {span > 0 && <Tick x={width - margin.right} y={height - 4} text={last_point.date} anchor="end" />}
        {goal > 0 && (
          <line x1={margin.left} y1={y(goal).toFixed(1)} x2={width - margin.right} y2={y(goal).toFixed(1)} stroke={colors.goal} strokeWidth={2} strokeDasharray="6 4">
            <title>{`${labels.goal}: ${format(goal)}`}</title>
          </line>
        )}
        {average.length > 1 && (
          <path
            d={average.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join("")}
            fill="none"
            stroke={colors.average}
            strokeWidth={2}
          >
            <title>{labels.average}</title>
          </path>
        )}
        {points.map((point) => (
          <circle key={point.date} cx={x(point.date).toFixed(1)} cy={y(point.value).toFixed(1)} r={3.5} fill={colors.points}>
            <title>{`${point.date}: ${format(point.value)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function Tick({ x, y, text, anchor }: { x: number; y: number; text: string; anchor: "start" | "end" }) {
  return <text x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle" className="tick">{text}</text>;
}
