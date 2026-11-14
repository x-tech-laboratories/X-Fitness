// The Goals tab: a plan for body fat, BMI, waist, weekly change and macros, the goals it gives from the latest readings
// beside the ones set now, each set once or kept following the plan.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_local } from "@x-tech-laboratories/x-libs/dates";
import { convert, format_measure, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { NumberField, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Facts, Section, SettingRow, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { activities, bmr_formulas, type Activity, type BmrFormula, type GoalKey } from "../../shared/calculators/formulas.ts";
import type { CalculatedGoal, CalculationsReport } from "../../shared/calculators/store.ts";
import { calls, use_data } from "../api.ts";
import { format_change, format_number, to_shown_value, to_stored_value, type ShownUnits } from "../body/format.ts";
import { today } from "../body/LogTab.tsx";
import type { FeatureSettingsProps } from "../features.tsx";

// ── Plan ─────────────────────────────────────────────────────────────────────

const mass = { kind: "weight", unit: "" } as const;

type SetSetting = FeatureSettingsProps["set_setting"];

function PlanNumber({ label, hint, value, unit, step, on_change }: { label: string; hint: string; value: number; unit: string; step: number; on_change: (value: number) => void }) {
  const shown = value !== 0 ? Number(value.toFixed(3)) : null;
  return (
    <SettingRow label={label} hint={hint}>
      <NumberField bare label={label} value={shown} step={step} unit={unit} on_change={(next) => next !== shown && on_change(next ?? 0)} />
    </SettingRow>
  );
}

const energy_sources: ["formula" | "measured", string][] = [["formula", "The BMR formula and activity"], ["measured", "The diary and the weight trend"]];

// How active the day is, the basal rate's formula and where the daily energy comes from, shared by this tab and Settings.
export function EnergySettings({ settings, set_setting }: { settings: Record<string, unknown>; set_setting: SetSetting }) {
  return (
    <>
      <SettingRow label="Activity" hint="Multiplies the basal rate into the energy burned a day.">
        <Select bare label="Activity" options={activities.map((activity): [Activity, string] => [activity.key, activity.label])} value={String(settings["calculators.activity"]) as Activity} on_change={(value) => void set_setting("calculators.activity", value)} />
      </SettingRow>
      <SettingRow label="BMR formula" hint="Katch-McArdle works from lean mass, so it needs a body fat; without one Mifflin-St Jeor is used.">
        <Select bare label="BMR formula" options={bmr_formulas.map((formula): [BmrFormula, string] => [formula.key, formula.label])} value={String(settings["calculators.bmr_formula"]) as BmrFormula} on_change={(value) => void set_setting("calculators.bmr_formula", value)} />
      </SettingRow>
      <SettingRow label="Daily energy from" hint="Measured takes what you ate less what your weight trend stored, once the diary has a week of days and the scales two weights a week apart; until then the formula is used.">
        <Select bare label="Daily energy from" options={energy_sources} value={String(settings["calculators.energy_source"]) === "measured" ? "measured" : "formula"} on_change={(value) => void set_setting("calculators.energy_source", value)} />
      </SettingRow>
      <SettingRow label="Days measured over" hint="How far back the diary and the weight trend are read.">
        <NumberField bare label="Days measured over" value={Number(settings["calculators.measured_days"]) || 28} min={7} step={7} unit="days" on_change={(value) => value && void set_setting("calculators.measured_days", value)} />
      </SettingRow>
    </>
  );
}

function Plan({ settings, units, set_setting }: { settings: Record<string, unknown>; units: ShownUnits; set_setting: SetSetting }) {
  const number = (key: string) => Number(settings[key]) || 0;
  // A rate per kg shown per pound is that much smaller.
  const per_mass = units.mass === "lb" ? convert(1, "lb", "kg") : 1;
  const weekly = number("calculators.weekly_change");
  const weekly_shown = weekly === 0 ? 0 : to_shown_value(mass, Math.abs(weekly), units) * Math.sign(weekly);

  return (
    <Section title="Plan">
      <PlanNumber label="Target body fat" unit="%" step={0.5} value={number("calculators.goal_body_fat")} hint="The goal weight keeps today's lean mass at this body fat. Leave empty to go by BMI." on_change={(value) => void set_setting("calculators.goal_body_fat", value)} />
      <PlanNumber label="Target BMI" unit="" step={0.5} value={number("calculators.goal_bmi")} hint="Sets the goal weight when there is no target body fat; 18.5 to 24.9 is the healthy range." on_change={(value) => void set_setting("calculators.goal_bmi", value)} />
      <PlanNumber label="Target waist to height" unit="" step={0.01} value={number("calculators.goal_waist_to_height")} hint="A waist under half the height, 0.5, is the usual healthy mark." on_change={(value) => void set_setting("calculators.goal_waist_to_height", value)} />
      <PlanNumber
        label="Weekly change"
        unit={`${units.mass} a week`}
        step={0.1}
        value={weekly_shown}
        hint="Below 0 to lose weight, above to gain; a kilogram of fat is about 7700 kcal."
        on_change={(value) => void set_setting("calculators.weekly_change", value === 0 ? 0 : to_stored_value(mass, Math.abs(value), units) * Math.sign(value))}
      />
      <PlanNumber
        label="Protein"
        unit={`g per ${units.mass}`}
        step={0.1}
        value={number("calculators.protein_per_kg") * per_mass}
        hint="Of body weight; 1.6 to 2.2 g per kg suits building or keeping muscle."
        on_change={(value) => void set_setting("calculators.protein_per_kg", value / per_mass)}
      />
      <PlanNumber label="Fat" unit="% of calories" step={1} value={number("calculators.fat_percent")} hint="The carbs take the calories left after protein and fat." on_change={(value) => void set_setting("calculators.fat_percent", value)} />
      <EnergySettings settings={settings} set_setting={set_setting} />
    </Section>
  );
}

// ── Goals ────────────────────────────────────────────────────────────────────

const goal_labels: Record<GoalKey, string> = {
  weight: "Weight",
  body_fat: "Body fat",
  waist: "Waist",
  calories: "Calories",
  protein: "Protein",
  fat: "Fat",
  carbs: "Carbs",
};

interface GoalRow extends CalculatedGoal {
  units: ShownUnits;
  energy: EnergyUnit;
}

function format_goal(row: GoalRow, value: number): string {
  if (row.key === "weight") return `${format_number(to_shown_value(mass, value, row.units))} ${row.units.mass}`;
  if (row.key === "waist") return `${format_number(to_shown_value({ kind: "length", unit: "" }, value, row.units))} ${row.units.length}`;
  if (row.key === "body_fat") return `${format_number(value)}%`;
  if (row.key === "calories") return format_measure(value, row.energy, 0);
  return `${format_number(value)} g`;
}

function holder_text(row: GoalRow): string {
  if (row.holder === "diet") return "Diet's daily target";
  if (row.holder) return `${row.holder.metric_name}'s goal`;
  return row.key === "waist" ? "No metric stands for the waist" : row.key === "body_fat" ? "No metric stands for body fat" : "No weight metric";
}

async function apply(keys: GoalKey[]): Promise<void> {
  try {
    const changed = await calls().apply_calculated_goals(keys, today());
    toast(changed === 0 ? "The goals already match the plan." : `Set ${changed} goal${changed === 1 ? "" : "s"} from the plan.`, { tone: "good" });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { tone: "bad" });
  }
}

function can_apply(row: CalculatedGoal): boolean {
  return row.value !== null && row.holder !== null && (row.current === null || Math.abs(row.current - row.value) > 1e-6);
}

const columns: TableColumn<GoalRow>[] = [
  { label: "Goal", cell: (row) => goal_labels[row.key] },
  { label: "From the plan", cell: (row) => (row.value === null ? "—" : format_goal(row, row.value)) },
  { label: "Set now", cell: (row) => (row.current === null ? "—" : format_goal(row, row.current)) },
  { label: "How", cell: (row) => <span className="muted">{row.basis}</span>, min_width: 220 },
  { label: "Kept in", cell: (row) => holder_text(row) },
  {
    label: "Actions",
    id: "actions",
    cell: (row) => (
      <button type="button" disabled={!can_apply(row)} aria-label={`Use the plan's ${goal_labels[row.key].toLowerCase()}`} onClick={() => void apply([row.key])}>Use</button>
    ),
  },
];

function Goals({ report, units, energy, set_setting }: { report: CalculationsReport; units: ShownUnits; energy: EnergyUnit; set_setting: SetSetting }) {
  const rows = report.goals.map((goal) => ({ ...goal, units, energy }));
  const ready = report.goals.filter(can_apply).map((goal) => goal.key);

  return (
    <Section title="Goals from the plan">
      <p className="muted">Worked out from your latest readings and the sex, height and birth date under Settings → Body.</p>
      <Toolbar>
        <button type="button" className="accent solid" disabled={ready.length === 0} onClick={() => void apply(ready)}>Use all</button>
      </Toolbar>
      <DataTable caption="Goals from the plan" columns={columns} rows={rows} row_key={(row) => row.key} />
      <SettingRow label="Body goals follow the plan" hint="Weight, body fat and waist goals are set again after every reading or change to the plan.">
        <Switch label="Body goals follow the plan" checked={report.following.body} on_change={async (on) => {
          await set_setting("calculators.follow_body_goals", on);
        }} />
      </SettingRow>
      <SettingRow label="Diet targets follow the plan" hint="The daily calories, protein, fat and carbs targets are set again after every change; turn this off to set them by hand.">
        <Switch label="Diet targets follow the plan" checked={report.following.diet} on_change={async (on) => {
          await set_setting("calculators.follow_diet_targets", on);
        }} />
      </SettingRow>
    </Section>
  );
}

// ── Time to goal ─────────────────────────────────────────────────────────────

// The day a number of weeks from today lands on.
function weeks_from(date: string, weeks: number): string {
  const day = new Date(`${date}T12:00:00`);
  day.setDate(day.getDate() + Math.round(weeks * 7));
  return format_local(day, false);
}

function TimeToGoal({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const { progress } = report;
  if (progress === null) return <p className="muted">Needs a weight reading and a goal on the weight metric; Use above sets one from the plan.</p>;
  const weight = (value: number) => `${format_number(to_shown_value(mass, value, units))} ${units.mass}`;
  const when = (weeks: number | null, why: string) => (weeks === null ? why : weeks === 0 ? "Reached" : `${weeks_from(report.date, weeks)}, in ${format_number(weeks)} weeks`);
  const trend = progress.trend_weekly_change;
  return (
    <Facts
      rows={[
        ["Weight now", weight(progress.weight)],
        ["Goal", weight(progress.goal)],
        ["To go", format_change(mass, progress.goal - progress.weight, units)],
        ["Trend", trend === null ? "Needs two weights a week apart" : `${format_change(mass, trend, units)} a week`],
        ["At the trend", when(progress.trend_weeks, trend === null ? "—" : "Not heading there")],
        ["At the plan's rate", when(progress.plan_weeks, report.plan.weekly_change === 0 ? "The plan keeps the weight" : "The plan heads the other way")],
      ]}
    />
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function GoalsTab({ settings, units, energy }: { settings: Record<string, unknown>; units: ShownUnits; energy: EnergyUnit }) {
  const report = use_data((api) => api.get_calculations(today()));
  const set_setting: SetSetting = async (key, value) => void (await calls().set_setting(key, value));

  return (
    <div className="stack">
      <Loaded resource={report}>
        {(loaded) => (
          <>
            <Goals report={loaded} units={units} energy={energy} set_setting={set_setting} />
            <Section title="Time to goal">
              <TimeToGoal report={loaded} units={units} />
            </Section>
          </>
        )}
      </Loaded>
      <Plan settings={settings} units={units} set_setting={set_setting} />
    </div>
  );
}
