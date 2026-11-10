// A sparkline drawn from its lowest reading rather than zero, so a slow change such as a kilo a month still shows.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Sparkline } from "@x-tech-laboratories/x-libs/web/react/charts";

// ── Sparkline ────────────────────────────────────────────────────────────────

export function FittedSparkline({ label, points, color = "var(--series-1)" }: { label: string; points: [epoch: number, value: number][]; color?: string }) {
  const values = points.map(([, value]) => value);
  const lowest = Math.min(...values);
  const span = Math.max(...values) - lowest;
  // A tenth of the span under the lowest reading keeps it off the floor; a flat series sits halfway up.
  const floor = span > 0 ? lowest - span * 0.1 : lowest - 1;
  return <Sparkline label={label} points={points.map(([epoch, value]): [number, number] => [epoch, value - floor])} top={span > 0 ? span * 1.1 : 2} color={color} />;
}
