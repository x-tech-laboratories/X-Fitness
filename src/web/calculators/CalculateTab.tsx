// The Calculators tab: the latest readings and settings as fields to change freely, and what BMI, body fat, lean mass,
// waist ratios and daily energy come to from them.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { format_measure, format_number } from "@x-tech-laboratories/x-libs/units";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, Cards, Facts, FormRow, Section, Toolbar, type Fact } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import {
  bmr_formulas,
  caliper_sites,
  calculate,
  least_logged_days,
  skinfolds,
  waist_to_height_category,
  waist_to_hip_category,
  type BodyFatSource,
  type CaliperMethod,
  type Measures,
  type Skinfold,
} from "../../shared/calculators/formulas.ts";
import type { CalculationsReport } from "../../shared/calculators/store.ts";
import { calls, succeeds, use_data } from "../api.ts";
import { body_measures, to_shown_value, to_stored_value } from "../body/format.ts";
import { UnitNumber } from "../unit_field.tsx";
import { format_mass, format_mass_change, type ShownUnits } from "../units.ts";
import { activity_options, bmr_formula_options, sex_options } from "./options.ts";

// ── Measures ─────────────────────────────────────────────────────────────────

type Measured = (typeof body_measures)[keyof typeof body_measures];

// The changes typed over the readings; a skinfold changed is kept apart so the rest still come from the readings.
type Changes = Partial<Omit<Measures, "skinfolds">> & { skinfolds?: Partial<Record<Skinfold, number>> };

function with_changes(measures: Measures, changes: Changes): Measures {
  return { ...measures, ...changes, skinfolds: { ...measures.skinfolds, ...changes.skinfolds } };
}

// Where a field's value comes from, such as "Weight on 2026-11-08".
function source_hint(report: CalculationsReport, measure: string, changed: boolean): string {
  if (changed) return "Changed here; the readings are kept as they are.";
  const source = report.sources[measure];
  if (!source) return "No metric stands for this; give one this role under Body → Metrics.";
  return source.reading ? `${source.metric.name} on ${source.reading.date}` : `No ${source.metric.name} reading yet`;
}

interface MeasureFieldProps {
  id: string;
  label: string;
  measured: Measured;
  // In kg or cm, 0 when missing.
  value: number;
  units: ShownUnits;
  hint: string;
  on_change: (value: number) => void;
}

function MeasureField({ id, label, measured, value, units, hint, on_change }: MeasureFieldProps) {
  const unit = measured === body_measures.weight ? units.mass : measured === body_measures.length ? units.length : "mm";
  return (
    <UnitNumber
      form_row={id}
      label={label}
      hint={hint}
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

function PlainField({ id, label, value, unit, hint, on_change }: { id: string; label: string; value: number; unit: string; hint: string; on_change: (value: number) => void }) {
  return <UnitNumber form_row={id} label={label} hint={hint} value={value} to_shown={(stored) => Math.round(stored * 10) / 10} min={0} step={unit === "years" ? 1 : 0.1} unit={unit} on_change={on_change} />;
}

// ── Results ──────────────────────────────────────────────────────────────────

const body_fat_sources: Record<BodyFatSource, string> = {
  reading: "your body fat reading",
  navy: "the US Navy method",
  jackson_pollock_7: "the 7-site caliper method",
  jackson_pollock_3: "the 3-site caliper method",
  bmi: "BMI, a rough estimate",
};

function percent(value: number): string {
  return `${format_number(value)}%`;
}

function missing(text: string): ReactNode {
  return <p className="muted">{text}</p>;
}

// A body fat worked out here can be logged as today's reading of the metric standing for body fat.
// The method names the button, since every body fat card has one.
function LogBodyFat({ report, value, method }: { report: CalculationsReport; value: number; method: string }) {
  const metric = report.sources.body_fat?.metric;
  if (!metric) return null;
  const rounded = Math.round(value * 10) / 10;
  const log = () => succeeds(() => calls().set_body_reading(metric.id, today(), rounded), `Logged ${percent(rounded)} as today's ${metric.name}.`);
  return <button type="button" aria-label={`Log the ${method} body fat as today's ${metric.name}`} onClick={() => void log()}>{`Log as today's ${metric.name}`}</button>;
}

function caliper_needs(method: CaliperMethod, measures: Measures): string {
  const sites = caliper_sites(method, measures.sex).map((site) => skinfolds.find((fold) => fold.key === site)!.label.toLowerCase());
  return `Needs a sex, an age and the ${sites.join(", ")} skinfolds.`;
}

function Results({ report, measures, units }: { report: CalculationsReport; measures: Measures; units: ShownUnits }) {
  const results = calculate(measures);
  const weight = (value: number) => format_mass(value, units);
  const kcal = (value: number) => `${format_measure(value, units.energy, 0)} a day`;
  const { composition } = results;

  return (
    <Cards>
      <Card title="BMI" subtitle="Body mass index: weight over height squared">
        {results.bmi === null ? missing("Needs a weight and a height.") : (
          <Facts
            rows={[
              ["BMI", format_number(results.bmi)],
              ["Category", results.bmi_category],
              results.healthy_weight && ["Healthy weight at this height", `${weight(results.healthy_weight.low)} – ${weight(results.healthy_weight.high)}`],
            ]}
          />
        )}
      </Card>
      <Card title="Body fat: US Navy" subtitle="From a tape round the neck, waist and, for women, hips">
        {results.navy_body_fat === null ? missing(measures.sex === "female" ? "Needs a height and the neck, waist and hip girths." : "Needs a sex, a height and the neck and waist girths.") : (
          <div className="stack tight">
            <Facts rows={[["Body fat", percent(results.navy_body_fat)]]} />
            <Toolbar><LogBodyFat report={report} value={results.navy_body_fat} method="US Navy" /></Toolbar>
          </div>
        )}
      </Card>
      <Card title="Body fat: calipers" subtitle="Jackson-Pollock skinfolds, by Siri's equation">
        <div className="stack tight">
          {([["jackson_pollock_3", "3-site", results.jackson_pollock_3], ["jackson_pollock_7", "7-site", results.jackson_pollock_7]] as const).map(([method, label, value]) => (
            <div key={method} className="stack tight">
              <Facts rows={[[label, value === null ? <span className="muted">{caliper_needs(method, measures)}</span> : percent(value)]]} />
              {value !== null && <Toolbar><LogBodyFat report={report} value={value} method={label} /></Toolbar>}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Body fat: from BMI" subtitle="Deurenberg's estimate from BMI, age and sex; rougher than a tape or calipers">
        {results.bmi_body_fat === null ? missing("Needs a weight, a height, a sex and an age.") : (
          <div className="stack tight">
            <Facts rows={[["Body fat", percent(results.bmi_body_fat)]]} />
            <Toolbar><LogBodyFat report={report} value={results.bmi_body_fat} method="BMI" /></Toolbar>
          </div>
        )}
      </Card>
      <Card title="Lean mass and FFMI" subtitle={results.body_fat_source ? `From ${body_fat_sources[results.body_fat_source]}` : "Fat-free mass and its index"}>
        {composition === null ? missing("Needs a weight and a body fat, read or worked out above.") : (
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
        {results.waist_to_height === null && results.waist_to_hip === null ? missing("Needs a waist girth, and a height or a hip girth.") : (
          <Facts
            rows={[
              results.waist_to_height !== null && ["Waist to height", `${results.waist_to_height.toFixed(2)} · ${waist_to_height_category(results.waist_to_height)}`],
              results.waist_to_hip !== null && ["Waist to hip", `${results.waist_to_hip.toFixed(2)} · ${waist_to_hip_category(results.waist_to_hip, measures.sex)}`],
            ]}
          />
        )}
      </Card>
      <Card title="Daily energy" subtitle="Basal metabolic rate (BMR) and total daily energy expenditure (TDEE)">
        {results.tdee === null ? missing("Needs a weight, a height and an age, or a weight and a body fat for Katch-McArdle.") : (
          <Facts
            rows={[
              ...bmr_formulas.map((formula): Fact | false => {
                const rate = results.basal_rates[formula.key];
                return rate !== null && [`BMR, ${formula.label.replace(/ \(.*\)$/, "")}${formula.key === results.bmr_formula ? " (used)" : ""}`, kcal(rate)];
              }),
              ["TDEE", kcal(results.tdee)],
            ]}
          />
        )}
      </Card>
      <Card title="Measured energy" subtitle={`What you ate less what your weight trend says was stored, over the last ${report.measured_days} days`}>
        {report.measured === null ? missing(`Needs at least ${least_logged_days} days in the diary and two weights a week apart in that time.`) : (
          <Facts
            rows={[
              ["TDEE, measured", kcal(report.measured.tdee)],
              ["Eaten a day", kcal(report.measured.average_intake)],
              ["Weight trend", `${format_mass_change(report.measured.weekly_change, units)} a week`],
              ["Days in the diary", String(report.measured.days_logged)],
            ]}
          />
        )}
      </Card>
      <Card title="Water" subtitle="About 35 ml a day for each kg of body weight, more with exercise and heat">
        {results.water === null ? missing("Needs a weight.") : <Facts rows={[["Water a day", `${format_number(results.water)} L`]]} />}
      </Card>
    </Cards>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

function Calculator({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const [changes, set_changes] = useState<Changes>({});
  const measures = with_changes(report.measures, changes);
  const change = (next: Changes) => set_changes((current) => ({ ...current, ...next, skinfolds: { ...current.skinfolds, ...next.skinfolds } }));
  const hint = (measure: string, key: keyof Measures) => source_hint(report, measure, key in changes);
  const setting_hint = (key: keyof Measures, where: string) => (key in changes ? "Changed here; the setting is kept as it is." : where);

  return (
    <div className="stack">
      <Section
        title="Your measures"
        tools={<button type="button" disabled={Object.keys(changes).length === 0} onClick={() => set_changes({})}>Use my readings</button>}
      >
        <p className="muted">Filled in from your latest readings and Settings. Change any of them to try other numbers; nothing here is saved.</p>
        <div className="stack tight">
          <FormRow label="Sex" id="calculator-sex" hint={setting_hint("sex", "From Settings → Body")}>
            <Select bare label="Sex" options={sex_options} value={measures.sex} on_change={(sex) => change({ sex })} />
          </FormRow>
          <PlainField id="calculator-age" label="Age" unit="years" value={measures.age} hint={setting_hint("age", report.birth_date ? `From the birth date ${report.birth_date}` : "Set a birth date under Settings → Body")} on_change={(age) => change({ age })} />
          <MeasureField id="calculator-height" label="Height" measured={body_measures.length} value={measures.height} units={units} hint={setting_hint("height", "From Settings → Body")} on_change={(height) => change({ height })} />
          <MeasureField id="calculator-weight" label="Weight" measured={body_measures.weight} value={measures.weight} units={units} hint={hint("weight", "weight")} on_change={(weight) => change({ weight })} />
          <PlainField id="calculator-body-fat" label="Body fat" unit="%" value={measures.body_fat} hint={hint("body_fat", "body_fat")} on_change={(body_fat) => change({ body_fat })} />
          <MeasureField id="calculator-neck" label="Neck" measured={body_measures.length} value={measures.neck} units={units} hint={hint("neck", "neck")} on_change={(neck) => change({ neck })} />
          <MeasureField id="calculator-waist" label="Waist" measured={body_measures.length} value={measures.waist} units={units} hint={hint("waist", "waist")} on_change={(waist) => change({ waist })} />
          <MeasureField id="calculator-hips" label="Hips" measured={body_measures.length} value={measures.hips} units={units} hint={hint("hips", "hips")} on_change={(hips) => change({ hips })} />
          <FormRow label="Activity" id="calculator-activity" hint={setting_hint("activity", "From Settings → Calculators")}>
            <Select bare label="Activity" options={activity_options} value={measures.activity} on_change={(activity) => change({ activity })} />
          </FormRow>
          <FormRow label="BMR formula" id="calculator-bmr-formula" hint={setting_hint("bmr_formula", "From Settings → Calculators")}>
            <Select bare label="BMR formula" options={bmr_formula_options} value={measures.bmr_formula} on_change={(bmr_formula) => change({ bmr_formula })} />
          </FormRow>
        </div>
      </Section>
      <Section title="Skinfolds">
        <div className="stack tight">
          {skinfolds.map((fold) => (
            <MeasureField
              key={fold.key}
              id={`calculator-skinfold-${fold.key}`}
              label={`${fold.label} skinfold`}
              measured={body_measures.skinfold}
              value={measures.skinfolds[fold.key] ?? 0}
              units={units}
              hint={source_hint(report, `skinfold_${fold.key}`, changes.skinfolds?.[fold.key] !== undefined)}
              on_change={(value) => change({ skinfolds: { [fold.key]: value } })}
            />
          ))}
        </div>
      </Section>
      <Results report={report} measures={measures} units={units} />
    </div>
  );
}

export function CalculateTab({ units }: { units: ShownUnits }) {
  const report = use_data((api) => api.get_calculations(today()));
  return <Loaded resource={report}>{(loaded) => <Calculator report={loaded} units={units} />}</Loaded>;
}
