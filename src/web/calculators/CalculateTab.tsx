// The Calculators page: the latest readings and settings as fields to change freely, beside what BMI, body fat by each
// method, lean mass, waist ratios, daily energy and water come to from them; nothing typed here is saved.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { format_measure, format_number } from "@x-tech-laboratories/x-libs/units";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, Cards, Facts, FormGroup, FormRow, Section, type Fact } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import {
  body_fat_needs,
  bmr_formulas,
  calculate,
  missing_needs,
  skinfolds,
  waist_to_height_category,
  waist_to_hip_category,
  type BodyFatSource,
  type Calculations,
  type Measures,
  type Need,
  type Skinfold,
} from "../../shared/calculators/formulas.ts";
import type { CalculationsReport } from "../../shared/calculators/store.ts";
import { calls, succeeds, use_data } from "../api.ts";
import { body_measures, to_shown_value, to_stored_value } from "../body/format.ts";
import { UnitNumber } from "../unit_field.tsx";
import { format_mass, type ShownUnits } from "../units.ts";
import { activity_options, bmr_formula_options, sex_options } from "./options.ts";

// ── Changes ──────────────────────────────────────────────────────────────────

type Measured = (typeof body_measures)[keyof typeof body_measures];

// The changes typed over the readings; a skinfold changed is kept apart so the rest still come from the readings.
type Changes = Partial<Omit<Measures, "skinfolds">> & { skinfolds?: Partial<Record<Skinfold, number>> };

type FieldKey = Exclude<keyof Measures, "skinfolds"> | Skinfold;

function with_changes(measures: Measures, changes: Changes): Measures {
  return { ...measures, ...changes, skinfolds: { ...measures.skinfolds, ...changes.skinfolds } };
}

function is_skinfold(key: FieldKey): key is Skinfold {
  return skinfolds.some((fold) => fold.key === key);
}

function is_changed(changes: Changes, key: FieldKey): boolean {
  return is_skinfold(key) ? changes.skinfolds?.[key] !== undefined : key in changes;
}

function without(changes: Changes, key: FieldKey): Changes {
  if (is_skinfold(key)) {
    const folds = { ...changes.skinfolds };
    delete folds[key];
    return { ...changes, skinfolds: folds };
  }
  const rest = { ...changes };
  delete rest[key];
  return rest;
}

function has_changes(changes: Changes): boolean {
  return Object.keys(changes).some((key) => key !== "skinfolds") || Object.keys(changes.skinfolds ?? {}).length > 0;
}

// ── Fields ───────────────────────────────────────────────────────────────────

interface FieldState {
  changed: boolean;
  reset: () => void;
  // Where the value comes from when it is not changed, such as an older reading's day.
  source: ReactNode;
}

// A changed field says so with its own way back; an unchanged one names only an older day or a missing source.
function field_hint(label: string, state: FieldState): ReactNode {
  if (!state.changed) return state.source || undefined;
  return (
    <span className="inline-row">
      <Badge tone="info">Changed</Badge>
      <button type="button" className="small" aria-label={`Reset ${label}`} onClick={state.reset}>Reset</button>
    </span>
  );
}

// Where a reading comes from: nothing for today's, the day for an older one, or what is missing.
function reading_source(report: CalculationsReport, measure: string): ReactNode {
  const source = report.sources[measure];
  if (!source) {
    return (
      <>
        No metric has this role; see <a href="#/body/metrics">Body → Metrics</a>
      </>
    );
  }
  if (!source.reading) return `No ${source.metric.name} reading yet`;
  return source.reading.date < report.date ? source.reading.date : null;
}

interface MeasureFieldProps {
  id: string;
  label: string;
  measured: Measured;
  // In kg or cm, 0 when missing.
  value: number;
  units: ShownUnits;
  state: FieldState;
  on_change: (value: number) => void;
}

function MeasureField({ id, label, measured, value, units, state, on_change }: MeasureFieldProps) {
  const unit = measured === body_measures.weight ? units.mass : measured === body_measures.length ? units.length : "mm";
  return (
    <UnitNumber
      form_row={id}
      label={label}
      hint={field_hint(label, state)}
      value={value}
      to_shown={(stored) => to_shown_value(measured, stored, units)}
      to_stored={(shown) => to_stored_value(measured, shown, units)}
      min={0}
      step={0.1}
      unit={unit}
      on_change={on_change}
    />
  );
}

function PlainField({ id, label, value, unit, state, on_change }: { id: string; label: string; value: number; unit: string; state: FieldState; on_change: (value: number) => void }) {
  return <UnitNumber form_row={id} label={label} hint={field_hint(label, state)} value={value} to_shown={(stored) => Math.round(stored * 10) / 10} min={0} step={unit === "years" ? 1 : 0.1} unit={unit} on_change={on_change} />;
}

// ── Missing measures ─────────────────────────────────────────────────────────

const need_words: Record<Exclude<Need, Skinfold>, string> = {
  sex: "a sex",
  age: "an age",
  height: "a height",
  weight: "a weight",
  body_fat: "a body fat reading",
  neck: "the neck",
  waist: "the waist",
  hips: "the hips",
};

const list_format = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

// "Needs a sex and the thigh skinfold.", naming only what is missing.
function needs_text(needs: Need[]): string {
  const folds = needs.filter((need): need is Skinfold => skinfolds.some((fold) => fold.key === need));
  const words = needs.filter((need): need is Exclude<Need, Skinfold> => !folds.includes(need as Skinfold)).map((need) => need_words[need]);
  if (folds.length === skinfolds.length) {
    words.push("all seven skinfolds");
  } else if (folds.length > 0) {
    const names = folds.map((fold) => skinfolds.find((item) => item.key === fold)!.label.toLowerCase());
    words.push(`the ${list_format.format(names)} skinfold${folds.length === 1 ? "" : "s"}`);
  }
  return `Needs ${list_format.format(words)}.`;
}

function missing(text: string): ReactNode {
  return <p className="muted">{text}</p>;
}

// ── Body fat ─────────────────────────────────────────────────────────────────

const body_fat_sources: Record<BodyFatSource, string> = {
  reading: "your body fat reading",
  navy: "the US Navy tape",
  jackson_pollock_7: "the 7-site calipers",
  jackson_pollock_3: "the 3-site calipers",
  bmi: "BMI, a rough estimate",
};

const body_fat_methods: { key: BodyFatSource; label: string }[] = [
  { key: "reading", label: "Your reading" },
  { key: "navy", label: "US Navy tape" },
  { key: "jackson_pollock_3", label: "3-site calipers" },
  { key: "jackson_pollock_7", label: "7-site calipers" },
  { key: "bmi", label: "From BMI" },
];

interface BodyFatRow {
  key: BodyFatSource;
  label: string;
  value: number | null;
  // Why there is no value.
  why: string;
  used: boolean;
  log: ReactNode;
}

function method_value(method: BodyFatSource, measures: Measures, results: Calculations): number | null {
  if (method === "reading") return measures.body_fat > 0 ? measures.body_fat : null;
  if (method === "navy") return results.navy_body_fat;
  if (method === "bmi") return results.bmi_body_fat;
  return results[method];
}

function percent(value: number): string {
  return `${format_number(value)}%`;
}

// A body fat worked out here can be logged as today's reading of the metric standing for body fat.
function LogBodyFat({ report, value, method }: { report: CalculationsReport; value: number; method: string }) {
  const metric = report.sources.body_fat?.metric;
  if (!metric) return null;
  const rounded = Math.round(value * 10) / 10;
  const log = () => succeeds(() => calls().set_body_reading(metric.id, today(), rounded), `Logged ${percent(rounded)} as today's ${metric.name}.`);
  return <button type="button" aria-label={`Log the ${method} body fat as today's ${metric.name}`} onClick={() => void log()}>Log</button>;
}

const body_fat_columns: TableColumn<BodyFatRow>[] = [
  { label: "Method", groupable: false, filterable: false, cell: (row) => row.label },
  {
    label: "Body fat",
    cell: (row) =>
      row.value === null ? (
        <span className="muted small">{row.why}</span>
      ) : (
        <span className="inline-row">
          {percent(row.value)}
          {row.used && <Badge tone="good" title="Lean mass and FFMI are worked out from this one">Used</Badge>}
        </span>
      ),
  },
  // No label, so a phone's card shows the Log button alone.
  { label: "", header: <span className="visually-hidden">Log</span>, id: "actions", class: "actions-cell", cell: (row) => row.log },
];

function BodyFatCard({ report, measures, results }: { report: CalculationsReport; measures: Measures; results: Calculations }) {
  const rows = body_fat_methods.map((method): BodyFatRow => {
    const value = method_value(method.key, measures, results);
    const lacking = missing_needs(body_fat_needs(method.key, measures.sex), measures);
    const why =
      method.key === "reading" && !report.sources.body_fat ? "No metric has the Body fat role" : lacking.length > 0 ? needs_text(lacking) : "Out of range for these measures.";
    const log = value !== null && method.key !== "reading" ? <LogBodyFat report={report} value={value} method={method.key === "navy" ? "US Navy" : method.key === "bmi" ? "BMI" : method.label.replace(" calipers", "")} /> : null;
    return { ...method, value, why, used: results.body_fat_source === method.key, log };
  });
  return (
    <Card title="Body fat" subtitle="By each method; the first that gives one is used for lean mass">
      <DataTable caption="Body fat by method" columns={body_fat_columns} rows={rows} row_key={(row) => row.key} />
    </Card>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

function Results({ report, measures, units }: { report: CalculationsReport; measures: Measures; units: ShownUnits }) {
  const results = calculate(measures);
  const weight = (value: number) => format_mass(value, units);
  const kcal = (value: number) => `${format_measure(value, units.energy, 0)} a day`;
  // The Daily energy card's figures leave "a day" to its title, so each fits on one line in a narrow card.
  const energy = (value: number) => format_measure(value, units.energy, 0);
  const { composition } = results;
  const needs = (list: Need[]) => needs_text(missing_needs(list, measures));
  const ratio_needs = measures.waist > 0 ? "Needs a height or the hips." : measures.height > 0 || measures.hips > 0 ? needs_text(["waist"]) : "Needs the waist, and a height or the hips.";
  const lean_needs = measures.weight > 0 ? "Needs a body fat, read or worked out by a method above." : needs_text(["weight"]);

  return (
    <div className="stack">
      <Section title="Body composition">
        <Cards>
          <Card title="BMI" subtitle="Body mass index: weight over height squared">
            {results.bmi === null ? missing(needs(["weight", "height"])) : (
              <Facts
                rows={[
                  ["BMI", `${format_number(results.bmi)} · ${results.bmi_category}`],
                  results.healthy_weight && ["Healthy weight", `${weight(results.healthy_weight.low)} – ${weight(results.healthy_weight.high)}`],
                ]}
              />
            )}
          </Card>
          <Card title="Lean mass and FFMI" subtitle={results.body_fat_source ? `From ${body_fat_sources[results.body_fat_source]}` : "Fat-free mass and its index"}>
            {composition === null ? missing(lean_needs) : (
              <Facts
                rows={[
                  ["Lean mass", weight(composition.lean_mass)],
                  ["Fat mass", weight(composition.fat_mass)],
                  composition.ffmi !== null && ["FFMI", format_number(composition.ffmi)],
                  composition.normalized_ffmi !== null && ["FFMI at 1.8 m", format_number(composition.normalized_ffmi)],
                ]}
              />
            )}
          </Card>
          <Card title="Waist ratios" subtitle="Belly fat measured against height and hips">
            {results.waist_to_height === null && results.waist_to_hip === null ? missing(ratio_needs) : (
              <Facts
                rows={[
                  results.waist_to_height !== null && ["Waist to height", `${results.waist_to_height.toFixed(2)} · ${waist_to_height_category(results.waist_to_height)}`],
                  results.waist_to_hip !== null && ["Waist to hip", `${results.waist_to_hip.toFixed(2)} · ${waist_to_hip_category(results.waist_to_hip, measures.sex)}`],
                ]}
              />
            )}
          </Card>
        </Cards>
        <BodyFatCard report={report} measures={measures} results={results} />
      </Section>
      <Section title="Energy">
        <Cards>
          <Card title="Daily energy" subtitle="Basal metabolic rate (BMR) and total daily energy expenditure (TDEE)">
            <div className="stack tight">
              {results.tdee === null ? missing(needs(["weight", "height", "age"])) : (
                <Facts
                  rows={[
                    ...bmr_formulas.map((formula): Fact | false => {
                      const rate = results.basal_rates[formula.key];
                      return rate !== null && [`BMR, ${formula.label.replace(/ \(.*\)$/, "")}${formula.key === results.bmr_formula ? " (used)" : ""}`, energy(rate)];
                    }),
                    ["TDEE", energy(results.tdee)],
                  ]}
                />
              )}
              {report.measured && (
                <p className="muted small">
                  Measured from your log: {kcal(report.measured.tdee)} — see <a href="#/goals">Goals</a>.
                </p>
              )}
            </div>
          </Card>
          <Card title="Water" subtitle="About 35 ml a day for each kg of body weight, more with exercise and heat">
            {results.water === null ? missing(needs(["weight"])) : <Facts rows={[["Water a day", `${format_number(results.water)} L`]]} />}
          </Card>
        </Cards>
      </Section>
    </div>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────

function Inputs({ report, measures, changes, set_changes, units }: { report: CalculationsReport; measures: Measures; changes: Changes; set_changes: (update: (current: Changes) => Changes) => void; units: ShownUnits }) {
  const change = (next: Changes) => set_changes((current) => ({ ...current, ...next, skinfolds: { ...current.skinfolds, ...next.skinfolds } }));
  const state = (key: FieldKey, source: ReactNode): FieldState => ({ changed: is_changed(changes, key), reset: () => set_changes((current) => without(current, key)), source });
  const reading = (key: FieldKey, measure: string = key) => state(key, reading_source(report, measure));
  const on_metrics = (text: string) => (
    <>
      {text} under <a href="#/body/metrics">Body → Metrics</a>
    </>
  );
  const any_fold = skinfolds.some((fold) => (measures.skinfolds[fold.key] ?? 0) > 0);

  return (
    <Section title="Your numbers" tools={<button type="button" disabled={!has_changes(changes)} onClick={() => set_changes(() => ({}))}>Use my readings</button>}>
      <p className="muted">Filled in from your latest readings. Change any to try other numbers; nothing here is saved.</p>
      <div className="stack tight">
        <h3>You</h3>
        <div className="form-rows">
          <FormRow label="Sex" id="calculator-sex" hint={field_hint("Sex", state("sex", report.measures.sex ? null : on_metrics("Set yours")))}>
            <Select bare id="calculator-sex" label="Sex" options={sex_options} value={measures.sex} on_change={(sex) => change({ sex })} />
          </FormRow>
          <PlainField id="calculator-age" label="Age" unit="years" value={measures.age} state={state("age", report.birth_date ? null : on_metrics("Set a birth date"))} on_change={(age) => change({ age })} />
          <MeasureField id="calculator-height" label="Height" measured={body_measures.length} value={measures.height} units={units} state={reading("height")} on_change={(height) => change({ height })} />
        </div>
      </div>
      <div className="stack tight">
        <h3>Readings</h3>
        <div className="form-rows">
          <MeasureField id="calculator-weight" label="Weight" measured={body_measures.weight} value={measures.weight} units={units} state={reading("weight")} on_change={(weight) => change({ weight })} />
          <PlainField id="calculator-body-fat" label="Body fat" unit="%" value={measures.body_fat} state={reading("body_fat")} on_change={(body_fat) => change({ body_fat })} />
          <MeasureField id="calculator-neck" label="Neck" measured={body_measures.length} value={measures.neck} units={units} state={reading("neck")} on_change={(neck) => change({ neck })} />
          <MeasureField id="calculator-waist" label="Waist" measured={body_measures.length} value={measures.waist} units={units} state={reading("waist")} on_change={(waist) => change({ waist })} />
          <MeasureField id="calculator-hips" label="Hips" measured={body_measures.length} value={measures.hips} units={units} state={reading("hips")} on_change={(hips) => change({ hips })} />
        </div>
      </div>
      <div className="stack tight">
        <h3>Energy</h3>
        <div className="form-rows">
          <FormRow label="Activity" id="calculator-activity" hint={field_hint("Activity", state("activity", null))}>
            <Select bare id="calculator-activity" label="Activity" options={activity_options} value={measures.activity} on_change={(activity) => change({ activity })} />
          </FormRow>
          <FormRow label="BMR formula" id="calculator-bmr-formula" hint={field_hint("BMR formula", state("bmr_formula", null))}>
            <Select bare id="calculator-bmr-formula" label="BMR formula" options={bmr_formula_options} value={measures.bmr_formula} on_change={(bmr_formula) => change({ bmr_formula })} />
          </FormRow>
        </div>
      </div>
      <FormGroup summary={<h3>Skinfolds</h3>} open={any_fold}>
        <div className="form-rows">
          {skinfolds.map((fold) => (
            <MeasureField
              key={fold.key}
              id={`calculator-skinfold-${fold.key}`}
              label={`${fold.label} skinfold`}
              measured={body_measures.skinfold}
              value={measures.skinfolds[fold.key] ?? 0}
              units={units}
              state={reading(fold.key, `skinfold_${fold.key}`)}
              on_change={(value) => change({ skinfolds: { [fold.key]: value } })}
            />
          ))}
        </div>
      </FormGroup>
    </Section>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

function Calculator({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const [changes, set_changes] = useState<Changes>({});
  const measures = with_changes(report.measures, changes);

  return (
    <div className="calculator-layout">
      <div className="calculator-inputs">
        <Inputs report={report} measures={measures} changes={changes} set_changes={set_changes} units={units} />
      </div>
      <div className="calculator-results">
        <Results report={report} measures={measures} units={units} />
      </div>
    </div>
  );
}

export function CalculateTab({ units }: { units: ShownUnits }) {
  const report = use_data((api) => api.get_calculations(today()));
  return <Loaded resource={report}>{(loaded) => <Calculator report={loaded} units={units} />}</Loaded>;
}
