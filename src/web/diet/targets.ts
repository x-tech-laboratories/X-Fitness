// What was eaten against the day's targets, as text such as "1,800 kcal / 2,200 kcal" and as the meters the Diary and the
// Overview draw.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import type { Meter } from "@x-tech-laboratories/x-libs/web/react/charts";

import { target_of } from "../../shared/diet/labels.ts";
import { target_progress, type NutrientInfo, type Nutrients } from "../../shared/diet/model.ts";
import { format_nutrient, shown_unit } from "./format.ts";

// ── Targets ──────────────────────────────────────────────────────────────────

// An amount eaten, with the target after it when one is set.
export function against_target(info: NutrientInfo, value: number, settings: Record<string, unknown>, energy: EnergyUnit): string {
  const progress = target_progress(value, target_of(settings, info.key), info.goal);
  return `${format_nutrient(info, value, energy)}${progress.target === null ? "" : ` / ${format_nutrient(info, progress.target, energy)}`}`;
}

// One meter per nutrient listed.
export function target_meters(totals: Nutrients, settings: Record<string, unknown>, energy: EnergyUnit, infos: NutrientInfo[]): Meter[] {
  return infos.map((info) => {
    const value = totals[info.key];
    const progress = target_progress(value, target_of(settings, info.key), info.goal);
    return {
      label: info.label,
      href: null,
      value_text: `${against_target(info, value, settings, energy)}${progress.over ? " · over" : ""}`,
      percent: progress.percent,
      color: progress.over ? "var(--status-danger)" : "var(--accent)",
      marks: [],
      title: progress.target === null ? "No target" : progress.over ? `Over the ${shown_unit(info, energy)} target` : null,
    };
  });
}
