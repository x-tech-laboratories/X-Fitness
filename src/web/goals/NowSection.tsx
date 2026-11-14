// Where I am now, read only: the sex and age, the latest weight, height, body fat and waist with their days, and the
// BMI, lean mass, waist ratio and weight trend they give.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_number } from "@x-tech-laboratories/x-libs/units";
import { Section, Tile, Tiles } from "@x-tech-laboratories/x-libs/web/react/layout";
import type { ReactNode } from "react";

import type { CalculationsReport } from "../../shared/calculators/store.ts";
import { format_value } from "../body/format.ts";
import { format_mass, format_mass_change, type ShownUnits } from "../units.ts";
import { role_labels } from "./wording.ts";

// ── Readings ─────────────────────────────────────────────────────────────────

function TileValue({ value, note }: { value: ReactNode; note?: ReactNode }) {
  return (
    <>
      <span>{value}</span>
      {note && <span className="muted small goals-tile-note">{note}</span>}
    </>
  );
}

// A reading's tile: its value and day, or why there is none.
function ReadingTile({ report, measure, units }: { report: CalculationsReport; measure: "weight" | "height" | "body_fat" | "waist"; units: ShownUnits }) {
  const source = report.sources[measure];
  const label = role_labels[measure];
  if (!source) return <Tile label={label} value={<TileValue value="—" note={<>No metric has the {label} role; give one under <a href="#/body/metrics">Body → Metrics</a></>} />} />;
  if (!source.reading) return <Tile label={label} value={<TileValue value="—" note={`No ${source.metric.name} reading yet`} />} />;
  return <Tile label={label} value={<TileValue value={format_value(source.metric, source.reading.value, units)} note={`on ${source.reading.date}`} />} />;
}

function Readings({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const { calculations } = report;
  const estimated = report.sources.body_fat?.reading ? null : calculations.body_fat;
  return (
    <Tiles>
      <YouTiles report={report} />
      <ReadingTile report={report} measure="weight" units={units} />
      <ReadingTile report={report} measure="height" units={units} />
      <ReadingTile report={report} measure="body_fat" units={units} />
      <ReadingTile report={report} measure="waist" units={units} />
      <Tile label="BMI" value={<TileValue value={calculations.bmi === null ? "—" : format_number(calculations.bmi)} note={calculations.bmi_category ?? "Needs a weight and a height"} />} />
      <Tile
        label="Lean mass"
        value={
          <TileValue
            value={calculations.composition ? format_mass(calculations.composition.lean_mass, units) : "—"}
            note={calculations.composition === null ? "Needs a body fat" : estimated !== null ? `At an estimated ${format_number(estimated)}% body fat` : undefined}
          />
        }
      />
      <Tile label="Waist to height" value={<TileValue value={calculations.waist_to_height === null ? "—" : calculations.waist_to_height.toFixed(2)} note={calculations.waist_to_height === null ? "Needs a waist and a height" : "Under 0.5 is the usual healthy mark"} />} />
      <Tile
        label="Weight trend"
        value={<TileValue value={report.weight_trend === null ? "—" : `${format_mass_change(report.weight_trend, units)} a week`} note={report.weight_trend === null ? "Needs two weights a week apart" : `Over the last ${report.measured_days} days`} />}
      />
    </Tiles>
  );
}

// ── You ──────────────────────────────────────────────────────────────────────

const sex_words = { "": "", female: "Female", male: "Male" } as const;

function YouTiles({ report }: { report: CalculationsReport }) {
  const { sex, age } = report.measures;
  const set_there = <>Set under <a href="#/body/metrics">Body → Metrics</a></>;
  return (
    <>
      <Tile label="Sex" value={<TileValue value={sex ? sex_words[sex] : "—"} note={sex ? undefined : set_there} />} />
      <Tile label="Age" value={<TileValue value={age > 0 ? `${age} years` : "—"} note={age > 0 ? undefined : <>Needs a birth date; set it under <a href="#/body/metrics">Body → Metrics</a></>} />} />
    </>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function NowSection({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  return (
    <Section title="Where I am now" tools={<a href="#/body/log">Add a reading in Body → Log</a>}>
      <Readings report={report} units={units} />
      <p className="muted small">
        Sex and birth date are changed under <a href="#/body/metrics">Body → Metrics</a>, with the metrics the readings come from.
      </p>
    </Section>
  );
}
