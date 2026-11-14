// Where I want to be: the body goals the person has set, each its own number apart from the metrics, with how far it is
// from the latest reading, a Remove button, an Add goal menu offering the rest, and helpers that fill the weight goal in
// from a BMI and the waist goal from the height.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { ContextMenu } from "@x-tech-laboratories/x-libs/web/react/menus";
import { Card, Cards, Section, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";

import { body_goal_keys, type BodyGoalKey, type MetricKind } from "../../shared/body/readings.ts";
import { body_mass_index, round_to, weight_at_bmi } from "../../shared/calculators/formulas.ts";
import type { CalculationsReport } from "../../shared/calculators/store.ts";
import { calls, succeeds } from "../api.ts";
import { format_value, to_shown_value, to_stored_value, unit_of } from "../body/format.ts";
import { UnitNumber } from "../unit_field.tsx";
import type { ShownUnits } from "../units.ts";
import { distance_words } from "./wording.ts";

// ── Shared ───────────────────────────────────────────────────────────────────

interface GoalInfo {
  key: BodyGoalKey;
  label: string;
  // How the goal is kept and shown, as a metric of this kind would be.
  measured: { kind: MetricKind; unit: string };
}

const suggested_bmi = 22;

function info_of(key: BodyGoalKey): GoalInfo {
  const goal = body_goal_keys.find((each) => each.key === key)!;
  return { key, label: goal.label, measured: { kind: goal.kind, unit: "" } };
}

// Saves a goal in its stored unit; 0 removes it.
async function save_goal(key: BodyGoalKey, value: number): Promise<boolean> {
  return succeeds(() => calls().set_body_goal(key, value > 0 ? value : null));
}

// The latest reading a goal is measured against, and whether it is only an estimate, or null without one.
function now_of(report: CalculationsReport, key: BodyGoalKey): { value: number; estimated: boolean } | null {
  const reading = report.sources[key]?.reading;
  if (reading && reading.value > 0) return { value: reading.value, estimated: false };
  if (key === "body_fat" && report.calculations.body_fat !== null && report.calculations.body_fat > 0) return { value: report.calculations.body_fat, estimated: true };
  return null;
}

// Where the measure is now and how far the goal is, such as "now 108.9 kg · 18.1 kg to lose", or null without a reading.
function distance_text(info: GoalInfo, goal: number, report: CalculationsReport, units: ShownUnits): string | null {
  const now = now_of(report, info.key);
  if (now === null) return null;
  const where = `now ${format_value(info.measured, now.value, units)}${now.estimated ? " (estimated)" : ""}`;
  if (!(goal > 0)) return where;
  return `${where} · ${distance_words(goal - now.value, (gap) => format_value(info.measured, gap, units), info.key === "weight")}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// What the goal means beside its height, such as "BMI 28" for the weight or "0.50 of your height" for the waist.
function height_note(key: BodyGoalKey, goal: number, report: CalculationsReport): string | null {
  const { height } = report.measures;
  if (!(goal > 0) || !(height > 0)) return null;
  const bmi = key === "weight" ? body_mass_index(goal, height) : null;
  if (bmi !== null) return `BMI ${format_number(bmi)}`;
  if (key === "waist") return `${(goal / height).toFixed(2)} of your height`;
  return null;
}

// The button that fills the goal in from the height: the weight for a BMI of 22, or the waist at half the height.
function FillButton({ info, report, units }: { info: GoalInfo; report: CalculationsReport; units: ShownUnits }) {
  const { height } = report.measures;
  const shown = (value: number) => format_value(info.measured, round_to(value, 0.1), units);
  if (info.key === "weight") {
    const at_bmi = weight_at_bmi(suggested_bmi, height);
    return (
      <button type="button" disabled={at_bmi === null} aria-label={`Set the goal weight for a BMI of ${suggested_bmi}`} onClick={() => at_bmi !== null && void save_goal("weight", round_to(at_bmi, 0.1))}>
        {at_bmi === null ? `BMI ${suggested_bmi} (needs a height)` : `BMI ${suggested_bmi} → ${shown(at_bmi)}`}
      </button>
    );
  }
  if (info.key === "waist") {
    const half = height > 0 ? height / 2 : null;
    return (
      <button type="button" disabled={half === null} aria-label="Set the goal waist to half your height" onClick={() => half !== null && void save_goal("waist", round_to(half, 0.1))}>
        {half === null ? "Half your height (needs a height)" : `Half your height → ${shown(half)}`}
      </button>
    );
  }
  return null;
}

// ── Goal ─────────────────────────────────────────────────────────────────────

interface GoalCardProps {
  info: GoalInfo;
  // In the stored unit; 0 while the goal is added but not yet given a value.
  goal: number;
  report: CalculationsReport;
  units: ShownUnits;
  on_cleared: () => void;
  on_removed: () => void;
}

function GoalCard({ info, goal, report, units, on_cleared, on_removed }: GoalCardProps) {
  const note = [distance_text(info, goal, report, units), height_note(info.key, goal, report)].filter(Boolean).join(" · ");
  const healthy = info.key === "weight" ? report.calculations.healthy_weight : null;
  const weight = (kg: number) => format_value(info.measured, round_to(kg, 0.1), units);
  const change = async (value: number) => {
    if ((await save_goal(info.key, value)) && !(value > 0)) on_cleared();
  };
  const remove = async () => {
    if (goal > 0 && !(await save_goal(info.key, 0))) return;
    on_removed();
  };
  return (
    <Card title={info.label}>
      <div className="stack tight">
        <UnitNumber
          bare
          label={`${info.label} goal`}
          value={goal}
          to_shown={(stored) => to_shown_value(info.measured, stored, units)}
          to_stored={(shown) => to_stored_value(info.measured, shown, units)}
          min={0}
          step={info.measured.kind === "percent" ? 0.5 : 0.1}
          unit={unit_of(info.measured, units) || undefined}
          on_change={(value) => void change(value)}
        />
        {note && <p className="muted small">{note}</p>}
        {healthy && <p className="muted small">{`A healthy BMI at your height is ${weight(healthy.low)} – ${weight(healthy.high)}.`}</p>}
        <Toolbar>
          <FillButton info={info} report={report} units={units} />
          <button type="button" className="danger" aria-label={`Remove the ${info.label.toLowerCase()} goal`} onClick={() => void remove()}>
            Remove
          </button>
        </Toolbar>
      </div>
    </Card>
  );
}

// ── Adding ───────────────────────────────────────────────────────────────────

// A button that opens a menu of the goals not yet set, hung below it.
function AddGoal({ free, on_add }: { free: GoalInfo[]; on_add: (key: BodyGoalKey) => void }) {
  const [open, set_open] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const place = button.current?.getBoundingClientRect();
  // A press on the button closes an open menu before the click lands, so the click goes by how it was at the press.
  const open_at_press = useRef<boolean | null>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="accent"
        disabled={free.length === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={() => { open_at_press.current = open; }}
        onClick={() => {
          const was_open = open_at_press.current ?? open;
          open_at_press.current = null;
          set_open(!was_open);
        }}
      >
        Add goal
      </button>
      {open && (
        <ContextMenu
          x={place?.left ?? 0}
          y={place?.bottom ?? 0}
          label="Add a goal"
          items={free.map((info) => ({ label: info.label, run: () => on_add(info.key) }))}
          on_close={() => set_open(false)}
        />
      )}
    </>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function GoalsSection({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  // Goals added here that have no value yet, shown as empty cards until one is typed.
  const [added, set_added] = useState<BodyGoalKey[]>([]);
  const goals = report.body_goals;
  const shown = body_goal_keys.filter(({ key }) => (goals[key] ?? 0) > 0 || added.includes(key)).map(({ key }) => info_of(key));
  const free = body_goal_keys.filter(({ key }) => !shown.some((info) => info.key === key)).map(({ key }) => info_of(key));
  const keep = (key: BodyGoalKey) => set_added((current) => (current.includes(key) ? current : [...current, key]));
  const drop = (key: BodyGoalKey) => set_added((current) => current.filter((each) => each !== key));

  return (
    <Section title="Where I want to be" tools={<AddGoal free={free} on_add={keep} />}>
      <p className="muted">
        Your goals, each a number of its own: the weight, body fat or a girth you want to reach. They are apart from the metrics on Body → Metrics, which say only what you measure.
      </p>
      {shown.length === 0 ? (
        <p className="muted">No goals yet; add one with Add goal.</p>
      ) : (
        <Cards>
          {shown.map((info) => (
            <GoalCard key={info.key} info={info} goal={goals[info.key] ?? 0} report={report} units={units} on_cleared={() => keep(info.key)} on_removed={() => drop(info.key)} />
          ))}
        </Cards>
      )}
    </Section>
  );
}
