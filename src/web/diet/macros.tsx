// How a day's energy splits between protein, carbs and fat, as the ring the Overview and the Trends tab draw.

// ── Imports ──────────────────────────────────────────────────────────────────

import { to_shown, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { Donut } from "@x-tech-laboratories/x-libs/web/react/charts";

import type { Nutrients } from "../../shared/diet/model.ts";

// ── Macros ───────────────────────────────────────────────────────────────────

export const macro_colors: [key: "protein" | "carbs" | "fat", label: string, color: string][] = [
  ["protein", "Protein", "var(--series-1)"],
  ["carbs", "Carbs", "var(--series-2)"],
  ["fat", "Fat", "var(--series-3)"],
];

// The kcal a gram of each macro gives, for its share of the day's energy.
const kcal_per_gram: Record<"protein" | "carbs" | "fat", number> = { protein: 4, carbs: 4, fat: 9 };

// A ring of each macro's share of the energy, with the energy in its middle.
export function MacroDonut({ totals, energy, title, center_label, message }: { totals: Nutrients; energy: EnergyUnit; title: string; center_label: string; message: string }) {
  return (
    <Donut
      title={title}
      parts={macro_colors.map(([key, label, color]) => ({ label, value: Math.round(totals[key] * kcal_per_gram[key]), color }))}
      center={Math.round(to_shown(totals.calories, energy)).toLocaleString()}
      center_label={center_label}
      message={message}
    />
  );
}
