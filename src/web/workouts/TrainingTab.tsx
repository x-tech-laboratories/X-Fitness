// The Training page's calculators from the workout log and readings: for strength, one-rep maxes with the weights at
// each share of one, strength scores and the plates on a bar; for cardio, heart-rate zones, VO2max and race times.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, Cards, Facts, FormRow, Section } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import type { BigLift, TrainingReport } from "../../shared/calculators/store.ts";
import {
  load_plates,
  one_rep_formulas,
  one_rep_maxes,
  percent_table,
  vo2max_from_cooper,
  type Lift,
  type PlateLoad,
} from "../../shared/calculators/training.ts";
import { use_data } from "../api.ts";
import { UnitNumber } from "../unit_field.tsx";
import type { ShownUnits } from "../units.ts";
import { plate_text } from "./TrainingSettings.tsx";
import { field_to_shown, field_to_stored, format_field, format_rest, format_weight } from "./units.ts";

// ── Shared ───────────────────────────────────────────────────────────────────

type Settings = Record<string, unknown>;

// A pointer to where a setting the page uses is changed.
function SettingsPointer({ children }: { children: string }) {
  return (
    <p className="muted small">
      {children} — change under <a href="#/settings">Settings → Workouts</a>.
    </p>
  );
}

// Whether an exercise was picked under Settings or guessed from the names.
function picked_or_guessed(settings: Settings, key: string): string {
  return settings[key] ? "picked" : "guessed from the names";
}

function plates_text(load: PlateLoad | null, units: ShownUnits): string {
  if (load === null) return "—";
  if (load.per_side.length === 0) return "The bar alone";
  return load.per_side.map((item) => `${item.count} × ${plate_text(item.plate, units)}`).join(", ");
}

// A weight typed in the unit shown, kept in kg.
function WeightField({ id, label, value, units, hint, on_change }: { id: string; label: string; value: number; units: ShownUnits; hint?: string; on_change: (kg: number) => void }) {
  return (
    <UnitNumber
      form_row={id}
      label={label}
      hint={hint}
      value={value}
      to_shown={(kg) => field_to_shown("weight", kg, units)}
      to_stored={(shown) => field_to_stored("weight", shown, units)}
      min={0}
      step={units.mass === "lb" ? 5 : 2.5}
      unit={units.mass}
      on_change={on_change}
    />
  );
}

// ── One-rep max ──────────────────────────────────────────────────────────────

interface PercentRow {
  percent: number;
  weight: number;
  reps: number;
  units: ShownUnits;
  plates: string;
}

const percent_columns: TableColumn<PercentRow>[] = [
  { label: "Of max", cell: (row) => `${row.percent}%` },
  { label: "Weight", cell: (row) => format_weight(row.weight, row.units) },
  { label: "About reps", cell: (row) => String(row.reps) },
  { label: "Plates a side", cell: (row) => row.plates },
];

function OneRepMax({ report, units }: { report: TrainingReport; units: ShownUnits }) {
  const [chosen, set_chosen] = useState(report.lifts[0]?.exercise_id ?? "");
  const best = report.lifts.find((lift) => lift.exercise_id === chosen);
  const [typed, set_typed] = useState<Lift | null>(null);
  const lift: Lift = typed ?? (best ? { weight: best.weight, reps: best.reps, rpe: best.rpe } : { weight: 0, reps: 0, rpe: 0 });
  const change = (changes: Partial<Lift>) => set_typed({ ...lift, ...changes });
  const maxes = one_rep_maxes(lift);
  const rows = maxes ? percent_table(maxes.epley).map((row) => ({ ...row, units, plates: plates_text(load_plates(row.weight, report.plates.bar, report.plates.plates), units) })) : [];
  const options: [string, string][] = [["", "Typed in"], ...report.lifts.map((item): [string, string] => [item.exercise_id, item.name])];

  return (
    <div className="stack tight">
      <h3>One-rep max</h3>
      <p className="muted">From your best set of each lift in the last 90 days, or a set typed in. An RPE counts the reps left in reserve.</p>
      <div className="training-pair">
        <div className="form-rows">
          <FormRow label="Lift" id="training-lift" hint={best && !typed ? `${format_weight(best.weight, units)} × ${best.reps}${best.rpe ? ` at RPE ${best.rpe}` : ""} on ${best.date}` : undefined}>
            <Select bare label="Lift" options={options} value={chosen} on_change={(value) => { set_chosen(value); set_typed(null); }} />
          </FormRow>
          <WeightField id="training-lift-weight" label="Weight lifted" value={lift.weight} units={units} on_change={(weight) => change({ weight })} />
          <FormRow label="Reps" id="training-lift-reps">
            <NumberField bare label="Reps" value={lift.reps || null} min={0} step={1} on_change={(reps) => change({ reps: reps ?? 0 })} />
          </FormRow>
          <FormRow label="RPE" id="training-lift-rpe" hint="10 is all-out; 8 leaves two reps in reserve. Leave empty when not rated.">
            <NumberField bare label="RPE" value={lift.rpe || null} min={0} max={10} step={0.5} on_change={(rpe) => change({ rpe: rpe ?? 0 })} />
          </FormRow>
        </div>
        {maxes === null ? (
          <p className="muted">{lift.weight > 0 ? "Needs the reps." : lift.reps > 0 ? "Needs the weight lifted." : "Needs a weight and reps."}</p>
        ) : (
          <Facts rows={one_rep_formulas.map((formula) => [`1RM, ${formula.label}`, format_weight(maxes[formula.key], units)])} />
        )}
      </div>
      {maxes !== null && <DataTable caption="Weights at each share of the one-rep max" columns={percent_columns} rows={rows} row_key={(row) => String(row.percent)} />}
    </div>
  );
}

// ── Strength scores ──────────────────────────────────────────────────────────

const big_lifts: { key: BigLift; label: string }[] = [
  { key: "squat", label: "Squat" },
  { key: "bench", label: "Bench press" },
  { key: "deadlift", label: "Deadlift" },
];

function StrengthScores({ report, settings, units }: { report: TrainingReport; settings: Settings; units: ShownUnits }) {
  const all_picked = big_lifts.every((lift) => picked_or_guessed(settings, `calculators.${lift.key}_exercise`) === "picked");
  return (
    <div className="stack tight">
      <h3>Strength scores</h3>
      <p className="muted">Your squat, bench press and deadlift maxes added up and weighed against your body weight, so lifters of any size compare.</p>
      <Facts
        rows={big_lifts.map((lift) => {
          const id = report.big_three[lift.key];
          const best = report.lifts.find((item) => item.exercise_id === id);
          return [lift.label, id === "" ? "No exercise fits" : best ? `${format_weight(best.one_rep_max, units)} · ${best.name}` : "No sets in the last 90 days"];
        })}
      />
      <SettingsPointer>{all_picked ? "The lifts are picked" : "The lifts are guessed from the names until picked"}</SettingsPointer>
      {report.total === null ? <p className="muted">Needs a recent set of all three lifts.</p> : (
        <Facts
          rows={[
            ["Total", format_weight(report.total, units)],
            ["Body weight", report.body_weight > 0 ? format_weight(report.body_weight, units) : "No weight reading"],
            report.scores !== null && ["Wilks", format_number(report.scores.wilks)],
            report.scores !== null && ["DOTS", format_number(report.scores.dots)],
            report.scores !== null && ["IPF GoodLift", format_number(report.scores.ipf_gl)],
            report.scores === null && ["Points", "Need a sex, set under Body → Metrics, and a weight reading"],
          ]}
        />
      )}
    </div>
  );
}

// ── Plates ───────────────────────────────────────────────────────────────────

function Plates({ report, units }: { report: TrainingReport; units: ShownUnits }) {
  const [target, set_target] = useState(0);
  const load = target > 0 ? load_plates(target, report.plates.bar, report.plates.plates) : null;
  const shown_plates = report.plates.plates.map((plate) => plate_text(plate, units)).join(", ");

  return (
    <div className="stack tight">
      <h3>Plates</h3>
      <div className="training-pair">
        <div className="form-rows">
          <WeightField id="training-plate-target" label="Weight to load" value={target} units={units} on_change={set_target} />
        </div>
        {load !== null && (
          <Facts
            rows={[
              ["Each side", plates_text(load, units)],
              Math.abs(load.loaded - target) > 0.01 && ["Nearest load", `${format_weight(load.loaded, units)}; the plates make up no closer`],
            ]}
          />
        )}
        {target > 0 && load === null && <p className="muted">Lighter than the bar.</p>}
      </div>
      <SettingsPointer>{`Bar ${format_weight(report.plates.bar, units)} · plates ${shown_plates}`}</SettingsPointer>
    </div>
  );
}

// ── Heart and runs ───────────────────────────────────────────────────────────

function Heart({ report }: { report: TrainingReport }) {
  const { heart } = report;
  const bpm = (value: number) => `${Math.round(value)} bpm`;
  return (
    <Card title="Heart-rate zones" subtitle="Karvonen: shares of the reserve between the resting and the maximum pulse">
      {heart.maximum === null ? <p className="muted">Needs a birth date, set under <a href="#/body/metrics">Body → Metrics</a>.</p> : heart.zones === null ? (
        <p className="muted">Needs a resting heart rate reading; give a metric the Resting heart rate role under Body → Metrics.</p>
      ) : (
        <Facts
          rows={[
            ["Resting", bpm(heart.resting!)],
            ["Maximum (Tanaka)", bpm(heart.maximum)],
            ...heart.zones.map((zone): [string, string] => [zone.label, `${Math.round(zone.low)}–${Math.round(zone.high)} bpm`]),
          ]}
        />
      )}
    </Card>
  );
}

function Fitness({ report, units }: { report: TrainingReport; units: ShownUnits }) {
  const [cooper, set_cooper] = useState(0);
  const from_cooper = vo2max_from_cooper(cooper);
  const { best } = report.running;
  return (
    <Card title="VO2max" subtitle="How much oxygen you can use, in ml per kg a minute">
      <div className="stack tight">
        <Facts
          rows={[
            ["From your best run (VDOT)", best ? format_number(best.vdot) : "Needs a run of 1 km or more"],
            ["From your pulse (Uth)", report.heart.vo2max !== null ? format_number(report.heart.vo2max) : "Needs a birth date and a resting heart rate"],
            from_cooper !== null && ["From the Cooper test", format_number(from_cooper)],
          ]}
        />
        <UnitNumber
          form_row="training-cooper"
          label="Cooper test"
          hint="The distance you can run in 12 minutes."
          value={cooper}
          to_shown={(km) => field_to_shown("distance", km, units)}
          to_stored={(shown) => field_to_stored("distance", shown, units)}
          min={0}
          step={0.1}
          unit={units.distance}
          on_change={set_cooper}
        />
      </div>
    </Card>
  );
}

interface RaceRow {
  label: string;
  distance: number;
  seconds: number;
  units: ShownUnits;
}

const race_columns: TableColumn<RaceRow>[] = [
  { label: "Race", cell: (row) => row.label },
  { label: "Time", cell: (row) => format_rest(Math.round(row.seconds)) },
  { label: "Pace", cell: (row) => `${format_rest(Math.round(row.seconds / field_to_shown("distance", row.distance, row.units)))} a ${row.units.distance}` },
];

function Races({ report, settings, units }: { report: TrainingReport; settings: Settings; units: ShownUnits }) {
  const { running } = report;
  const name = report.cardio_exercises.find((exercise) => exercise.id === running.exercise_id)?.name;
  return (
    <div className="stack tight">
      <h3>Race times</h3>
      <p className="muted">Your fastest run in the last 90 days, by VDOT, predicts the rest by Riegel's formula.</p>
      <SettingsPointer>{name ? `From ${name}, ${picked_or_guessed(settings, "calculators.running_exercise")}` : "No cardio exercise fits running"}</SettingsPointer>
      {running.best === null ? <p className="muted">Needs a run of 1 km or more, with its time, in the last 90 days.</p> : (
        <>
          <p className="muted">{`From ${format_field("distance", running.best.distance, units)} in ${format_rest(Math.round(running.best.duration))} on ${running.best.date}.`}</p>
          <DataTable caption="Predicted race times" columns={race_columns} rows={running.predictions.map((row) => ({ ...row, units }))} row_key={(row) => row.label} />
        </>
      )}
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function TrainingTab({ settings, units }: { settings: Settings; units: ShownUnits }) {
  const report = use_data((api) => api.get_training_calculations(today()));
  return (
    <Loaded resource={report}>
      {(loaded) => (
        <div className="stack">
          <Section title="Strength">
            <OneRepMax report={loaded} units={units} />
            <StrengthScores report={loaded} settings={settings} units={units} />
            <Plates report={loaded} units={units} />
          </Section>
          <Section title="Cardio">
            <Cards>
              <Heart report={loaded} />
              <Fitness report={loaded} units={units} />
            </Cards>
            <Races report={loaded} settings={settings} units={units} />
          </Section>
        </div>
      )}
    </Loaded>
  );
}
