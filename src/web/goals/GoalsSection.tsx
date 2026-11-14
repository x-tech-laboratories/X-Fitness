// Where I want to be: the goals of the weight, body fat and waist metrics, edited here as on Body → Metrics, each with
// how far it is from now and helpers that fill the weight and waist goals in from a BMI, a body fat or the height.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, Cards, Section, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { BodyMetric } from "../../shared/body/readings.ts";
import { body_mass_index, round_to, weight_at_bmi, weight_at_body_fat } from "../../shared/calculators/formulas.ts";
import type { CalculationsReport } from "../../shared/calculators/store.ts";
import { calls, succeeds } from "../api.ts";
import { format_value, to_shown_value, to_stored_value, unit_of } from "../body/format.ts";
import { UnitNumber } from "../unit_field.tsx";
import type { ShownUnits } from "../units.ts";
import { role_labels } from "./wording.ts";

// ── Shared ───────────────────────────────────────────────────────────────────

type GoalMeasure = "weight" | "body_fat" | "waist";

const suggested_bmi = 22;

// Saves a metric's goal in its stored unit, 0 for none, as Body → Metrics does.
async function save_goal(metric: BodyMetric, goal: number): Promise<void> {
  await succeeds(() => calls().save_body_metric({ id: metric.id, name: metric.name, kind: metric.kind, unit: metric.unit, goal, comment: metric.comment, role: metric.role }));
}

// How far the goal is from now, such as "7.4 kg to lose".
function distance_text(metric: BodyMetric, goal: number, now: number | null, units: ShownUnits): string | null {
  if (!(goal > 0) || now === null || !(now > 0)) return null;
  const difference = goal - now;
  if (Math.abs(difference) < 0.05) return "Reached";
  const verb = metric.kind === "weight" ? (difference < 0 ? "to lose" : "to gain") : difference < 0 ? "to go down" : "to go up";
  return `${format_value(metric, Math.abs(difference), units)} ${verb}`;
}

function GoalField({ metric, units, label }: { metric: BodyMetric; units: ShownUnits; label: string }) {
  return (
    <UnitNumber
      label={label}
      value={metric.goal}
      to_shown={(stored) => to_shown_value(metric, stored, units)}
      to_stored={(shown) => to_stored_value(metric, shown, units)}
      min={0}
      step={metric.kind === "percent" ? 0.5 : 0.1}
      unit={unit_of(metric, units) || undefined}
      on_change={(goal) => void save_goal(metric, goal)}
    />
  );
}

// A goal without a metric to hold it says where to give one the role.
function NoMetric({ measure }: { measure: GoalMeasure }) {
  return (
    <p className="muted">
      No metric has the {role_labels[measure]} role; give one under <a href="#/body/metrics">Body → Metrics</a>.
    </p>
  );
}

// ── Weight ───────────────────────────────────────────────────────────────────

function WeightGoal({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const metric = report.sources.weight?.metric;
  const [body_fat, set_body_fat] = useState<number | null>(15);
  if (!metric) return <NoMetric measure="weight" />;
  const { measures, calculations } = report;
  const lean = calculations.composition?.lean_mass ?? 0;
  const goal = metric.goal;
  const at_bmi = weight_at_bmi(suggested_bmi, measures.height);
  const at_body_fat = body_fat ? weight_at_body_fat(lean, body_fat) : null;
  const goal_bmi = goal > 0 ? body_mass_index(goal, measures.height) : null;
  const goal_body_fat = goal > 0 && lean > 0 && goal > lean ? (1 - lean / goal) * 100 : null;
  const meaning = [goal_bmi !== null && `BMI ${format_number(goal_bmi)}`, goal_body_fat !== null && `${format_number(goal_body_fat)}% body fat at today's lean mass`].filter(Boolean).join(" · ");
  const distance = distance_text(metric, goal, measures.weight || null, units);
  const weight = (kg: number) => format_value(metric, round_to(kg, 0.1), units);

  return (
    <div className="stack tight">
      <GoalField metric={metric} units={units} label="Goal weight" />
      {(distance || meaning) && <p className="muted small">{[distance, meaning].filter(Boolean).join(" · ")}</p>}
      <div className="stack tight">
        <span className="small">Fill it in from</span>
        <Toolbar>
          <button type="button" disabled={at_bmi === null} aria-label={`Set the goal weight for a BMI of ${suggested_bmi}`} onClick={() => at_bmi !== null && void save_goal(metric, round_to(at_bmi, 0.1))}>
            {at_bmi === null ? `BMI ${suggested_bmi}` : `BMI ${suggested_bmi} → ${weight(at_bmi)}`}
          </button>
        </Toolbar>
        <div className="inline-row">
          <NumberField bare label="Body fat for the goal weight" value={body_fat} min={3} max={60} step={1} unit="%" on_change={set_body_fat} />
          <button type="button" disabled={at_body_fat === null} aria-label={`Set the goal weight for ${body_fat ?? 0}% body fat`} onClick={() => at_body_fat !== null && void save_goal(metric, round_to(at_body_fat, 0.1))}>
            {at_body_fat === null ? "Needs a body fat" : `→ ${weight(at_body_fat)}`}
          </button>
        </div>
        {calculations.healthy_weight && (
          <p className="muted small">{`A healthy BMI at your height is ${weight(calculations.healthy_weight.low)} – ${weight(calculations.healthy_weight.high)}.`}</p>
        )}
        {measures.height > 0 ? null : <p className="muted small">The BMI needs a height reading.</p>}
      </div>
    </div>
  );
}

// ── Body fat and waist ───────────────────────────────────────────────────────

function BodyFatGoal({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const metric = report.sources.body_fat?.metric;
  if (!metric) return <NoMetric measure="body_fat" />;
  const distance = distance_text(metric, metric.goal, report.calculations.body_fat, units);
  return (
    <div className="stack tight">
      <GoalField metric={metric} units={units} label="Goal body fat" />
      {distance && <p className="muted small">{report.sources.body_fat?.reading ? distance : `${distance}, from an estimate`}</p>}
    </div>
  );
}

function WaistGoal({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const metric = report.sources.waist?.metric;
  if (!metric) return <NoMetric measure="waist" />;
  const { height } = report.measures;
  const half = height > 0 ? height / 2 : null;
  const distance = distance_text(metric, metric.goal, report.measures.waist || null, units);
  const ratio = metric.goal > 0 && height > 0 ? `${(metric.goal / height).toFixed(2)} of your height` : null;
  return (
    <div className="stack tight">
      <GoalField metric={metric} units={units} label="Goal waist" />
      {(distance || ratio) && <p className="muted small">{[distance, ratio].filter(Boolean).join(" · ")}</p>}
      <Toolbar>
        <button type="button" disabled={half === null} aria-label="Set the goal waist to half your height" onClick={() => half !== null && void save_goal(metric, round_to(half, 0.1))}>
          {half === null ? "Half your height (needs a height)" : `Half your height → ${format_value(metric, round_to(half, 0.1), units)}`}
        </button>
      </Toolbar>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function GoalsSection({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  return (
    <Section title="Where I want to be">
      <p className="muted">These are the goals of your Weight, Body fat and Waist metrics, the same ones Body → Metrics shows. Leave a field empty for no goal.</p>
      <Cards>
        <Card title="Weight">
          <WeightGoal report={report} units={units} />
        </Card>
        <Card title="Body fat">
          <BodyFatGoal report={report} units={units} />
        </Card>
        <Card title="Waist">
          <WaistGoal report={report} units={units} />
        </Card>
      </Cards>
    </Section>
  );
}
