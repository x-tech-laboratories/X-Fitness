// How I get there: the pace, the daily energy and the eating that make the plan, the diet's daily targets it gives,
// set once or kept following it, and when the goal weight is reached at the plan's rate and at the trend.

// ── Imports ──────────────────────────────────────────────────────────────────

import { shift_day, today } from "@x-tech-laboratories/x-libs/dates";
import { convert, format_measure, format_number, to_stored } from "@x-tech-laboratories/x-libs/units";
import { Segmented, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Facts, Section, SettingRow, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { daily_energy_change, least_logged_days, type Activity, type GoalKey } from "../../shared/calculators/formulas.ts";
import type { CalculatedGoal, CalculationsReport } from "../../shared/calculators/store.ts";
import { attempt, calls, set_setting } from "../api.ts";
import { activity_options } from "../calculators/options.ts";
import { UnitNumber } from "../unit_field.tsx";
import { format_mass, format_mass_change, to_shown_tenth, type ShownUnits } from "../units.ts";
import { distance_words } from "./wording.ts";

// ── Shared ───────────────────────────────────────────────────────────────────

type Settings = Record<string, unknown>;

function number_of(settings: Settings, key: string): number {
  return Number(settings[key]) || 0;
}

function energy_text(kcal: number, units: ShownUnits): string {
  return `${format_measure(kcal, units.energy, 0)} a day`;
}

// ── Pace ─────────────────────────────────────────────────────────────────────

type Direction = "lose" | "keep" | "gain";

const directions: { value: Direction; label: string }[] = [
  { value: "lose", label: "Lose" },
  { value: "keep", label: "Keep" },
  { value: "gain", label: "Gain" },
];

// Half a kilogram or a pound a week when a direction is picked from Keep.
function starting_rate(units: ShownUnits): number {
  return units.mass === "lb" ? to_stored(1, "lb") : 0.5;
}

function Pace({ report, settings, units }: { report: CalculationsReport; settings: Settings; units: ShownUnits }) {
  const weekly = number_of(settings, "calculators.weekly_change");
  const direction: Direction = weekly < 0 ? "lose" : weekly > 0 ? "gain" : "keep";
  const rate = Math.abs(weekly);
  const daily = daily_energy_change(weekly);
  const goal = report.sources.weight?.metric.goal ?? 0;
  const weight = report.measures.weight;
  const away = goal > 0 && weight > 0 && ((weekly < 0 && goal > weight) || (weekly > 0 && goal < weight));
  const choose = (next: Direction) => {
    if (next === direction) return;
    const magnitude = rate > 0 ? rate : starting_rate(units);
    void set_setting("calculators.weekly_change", next === "keep" ? 0 : next === "lose" ? -magnitude : magnitude);
  };

  return (
    <>
      <SettingRow label="Weight" hint={weekly === 0 ? "Eat what you burn." : `About ${energy_text(Math.abs(daily), units)} ${weekly < 0 ? "under" : "over"} what you burn; a kilogram of fat is about 7700 kcal.`}>
        <Segmented label="Weight" choices={directions} value={direction} on_change={choose} />
      </SettingRow>
      {direction !== "keep" && (
        <UnitNumber
          setting_row
          label="Rate"
          hint="How much a week; half to one percent of your weight a week is a usual pace."
          value={rate}
          to_shown={(kg) => to_shown_tenth(kg, units.mass)}
          to_stored={(shown) => to_stored(shown, units.mass)}
          min={0}
          step={0.1}
          unit={`${units.mass} a week`}
          on_change={(value) => void set_setting("calculators.weekly_change", direction === "lose" ? -value : value)}
        />
      )}
      {away && <p className="tone-warn">{`The plan ${weekly < 0 ? "loses" : "gains"} weight, but the goal of ${format_mass(goal, units)} is ${weekly < 0 ? "above" : "below"} your ${format_mass(weight, units)}.`}</p>}
    </>
  );
}

// ── Energy ───────────────────────────────────────────────────────────────────

function Energy({ report, settings, units }: { report: CalculationsReport; settings: Settings; units: ShownUnits }) {
  const { measured } = report;
  const formula = report.calculations.tdee;
  const source = report.energy_source;
  const choices: { value: "formula" | "measured"; label: string }[] = [
    { value: "formula", label: "Formula" },
    { value: "measured", label: "Measured" },
  ];
  const measured_hint =
    measured === null
      ? `Measured needs ${least_logged_days} days in the diary and two weights a week apart in the last ${report.measured_days} days; until then the formula is used.`
      : `Measured takes what you ate less what your weight trend stored over the last ${report.measured_days} days.`;

  return (
    <>
      <SettingRow label="Activity" hint="Multiplies the basal rate into the energy the formula says you burn a day.">
        <Select bare label="Activity" options={activity_options} value={String(settings["calculators.activity"]) as Activity} on_change={(value) => void set_setting("calculators.activity", value)} />
      </SettingRow>
      <SettingRow label="Daily energy from" hint={measured_hint}>
        <Segmented label="Daily energy from" choices={choices} value={source} on_change={(value) => void set_setting("calculators.energy_source", value)} />
      </SettingRow>
      <Facts
        rows={[
          ["Formula", formula === null ? "Needs a weight, a height and an age" : energy_text(formula, units)],
          ["Measured", measured === null ? `Needs ${least_logged_days} diary days and two weights a week apart` : energy_text(measured.tdee, units)],
          measured !== null && ["Eaten a day", energy_text(measured.average_intake, units)],
          measured !== null && ["Weight trend", `${format_mass_change(measured.weekly_change, units)} a week`],
          measured !== null && ["Days in the diary", String(measured.days_logged)],
        ]}
      />
      <p className="muted small">
        The BMR formula and the days measured over are under <a href="#/settings">Settings → Calculators</a>.
      </p>
    </>
  );
}

// ── Eating ───────────────────────────────────────────────────────────────────

function grams_of(report: CalculationsReport, key: GoalKey): string | null {
  const value = report.goals.find((goal) => goal.key === key)?.value ?? null;
  return value === null ? null : `${format_number(value)} g a day`;
}

function Eating({ report, settings, units }: { report: CalculationsReport; settings: Settings; units: ShownUnits }) {
  // A rate per kg shown per pound is that much smaller.
  const per_mass = units.mass === "lb" ? convert(1, "lb", "kg") : 1;
  const protein = grams_of(report, "protein");
  const fat = grams_of(report, "fat");
  const carbs = grams_of(report, "carbs");
  return (
    <>
      <UnitNumber
        setting_row
        label="Protein"
        unit={`g per ${units.mass}`}
        step={0.1}
        value={number_of(settings, "calculators.protein_per_kg") * per_mass}
        to_shown={(stored) => Number(stored.toFixed(2))}
        hint={`${protein ? `Comes to ${protein}. ` : ""}1.6 to 2.2 g per kg of body weight suits building or keeping muscle.`}
        on_change={(value) => void set_setting("calculators.protein_per_kg", value / per_mass)}
      />
      <UnitNumber
        setting_row
        label="Fat"
        unit="% of calories"
        step={1}
        value={number_of(settings, "calculators.fat_percent")}
        hint={fat ? `Comes to ${fat}.` : "A share of the day's calories."}
        on_change={(value) => void set_setting("calculators.fat_percent", value)}
      />
      <p className="muted">{carbs ? `Carbs take the calories left: ${carbs}.` : "Carbs take the calories left after protein and fat."}</p>
    </>
  );
}

// ── Daily targets ────────────────────────────────────────────────────────────

const target_labels: Record<GoalKey, string> = { calories: "Calories", protein: "Protein", fat: "Fat", carbs: "Carbs" };

function format_target(goal: CalculatedGoal, value: number, units: ShownUnits): string {
  return goal.key === "calories" ? format_measure(value, units.energy, 0) : `${format_number(value)} g`;
}

function differs(goal: CalculatedGoal): boolean {
  return goal.value !== null && (goal.current === null || Math.abs(goal.current - goal.value) > 1e-6);
}

async function apply_once(keys: GoalKey[]): Promise<void> {
  const changed = await attempt(() => calls().apply_calculated_goals(keys, today()));
  if (changed === undefined) return;
  toast(changed === 0 ? "The daily targets already match the plan." : `Set ${changed} daily target${changed === 1 ? "" : "s"} from the plan.`, { tone: "good" });
}

function DailyTargets({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const following = report.following_diet;
  const ready = report.goals.filter(differs).map((goal) => goal.key);
  return (
    <>
      <ul className="plain-list">
        {report.goals.map((goal) => (
          <li key={goal.key}>
            <div className="spread-row">
              <strong>{target_labels[goal.key]}</strong>
              <span className="number">{goal.value === null ? "—" : format_target(goal, goal.value, units)}</span>
            </div>
            <div className="muted small">
              {goal.basis}
              {!following && differs(goal) && goal.current !== null && `; in the diary now ${format_target(goal, goal.current, units)}`}
            </div>
          </li>
        ))}
      </ul>
      <SettingRow label="Keep the diet's daily targets set to these" hint="The diary's calories, protein, fat and carbs targets are set again after every change; off, they are yours to set under Diet → Settings.">
        <Switch label="Keep the diet's daily targets set to these" checked={following} on_change={(on) => set_setting("calculators.follow_diet_targets", on)} />
      </SettingRow>
      {!following && (
        <Toolbar>
          <button type="button" className="accent solid" disabled={ready.length === 0} aria-label="Apply the daily targets once" onClick={() => void apply_once(ready)}>
            Apply once
          </button>
        </Toolbar>
      )}
    </>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ report, units }: { report: CalculationsReport; units: ShownUnits }) {
  const { progress } = report;
  if (report.measures.weight <= 0) return <p className="muted">Needs a weight reading.</p>;
  if (progress === null) return <p className="muted">Needs a goal weight, set above under Where I want to be.</p>;
  const when = (weeks: number | null, why: string) => (weeks === null ? why : weeks === 0 ? "Reached" : `${shift_day(report.date, Math.round(weeks * 7))}, in ${format_number(weeks)} weeks`);
  const trend = progress.trend_weekly_change;
  return (
    <Facts
      rows={[
        ["From", format_mass(progress.weight, units)],
        ["To", format_mass(progress.goal, units)],
        ["To go", distance_words(progress.goal - progress.weight, (kg) => format_mass(kg, units), true)],
        ["At the plan's rate", when(progress.plan_weeks, report.plan.weekly_change === 0 ? "The plan keeps the weight" : "The plan heads the other way")],
        ["At your trend", when(progress.trend_weeks, trend === null ? "Needs two weights a week apart" : "Not heading there")],
      ]}
    />
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function PlanSection({ report, settings, units }: { report: CalculationsReport; settings: Settings; units: ShownUnits }) {
  return (
    <Section title="How I get there">
      <div className="stack tight">
        <h3>Pace</h3>
        <Pace report={report} settings={settings} units={units} />
      </div>
      <div className="stack tight">
        <h3>Energy</h3>
        <Energy report={report} settings={settings} units={units} />
      </div>
      <div className="stack tight">
        <h3>Eating</h3>
        <Eating report={report} settings={settings} units={units} />
      </div>
      <div className="stack tight">
        <h3>Daily targets</h3>
        <DailyTargets report={report} units={units} />
      </div>
      <div className="stack tight">
        <h3>When you get there</h3>
        <Timeline report={report} units={units} />
      </div>
    </Section>
  );
}
