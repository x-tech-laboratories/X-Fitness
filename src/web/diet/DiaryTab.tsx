// The Diary tab: one day's foods and recipes by meal, their totals against the day's targets, how the day's energy split
// between its meals, and logging what was eaten.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { is_day, today } from "@x-tech-laboratories/x-libs/dates";
import { format_measure, to_shown, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { Donut, Meters, type Meter } from "@x-tech-laboratories/x-libs/web/react/charts";
import { NumberField, PeriodStepper, Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Section, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { shown_nutrients, target_of } from "../../shared/diet/labels.ts";
import { by_id, food_label, meal_at, normalize_meals, nutrient_groups, nutrients, serving_unit, target_key, target_progress, type EntryKind, type Food, type Meal, type NutrientInfo, type Nutrients, type Recipe } from "../../shared/diet/model.ts";
import type { DayEntry, DietData, MealMacros } from "../../shared/diet/store.ts";
import { attempt, calls, succeeds, use_data } from "../api.ts";
import { CategorizedSelect } from "../categories.tsx";
import { row_actions_column } from "../rows.tsx";
import { format_amount, format_nutrient, shown_unit, to_shown_value } from "./format.ts";
import { FoodUnitSelect } from "./widgets.tsx";

// ── Dates ────────────────────────────────────────────────────────────────────

// The day shown is kept for this tab's session, so it survives a visit to another tab and starts at today next time.
function session_storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

// ── Totals ───────────────────────────────────────────────────────────────────

// One meter per nutrient listed.
export function target_meters(totals: Nutrients, settings: Record<string, unknown>, energy: EnergyUnit, infos: NutrientInfo[]): Meter[] {
  return infos.map((info) => {
    const value = totals[info.key];
    const progress = target_progress(value, target_of(settings, info.key), info.goal);
    const shown = format_nutrient(info, value, energy);
    const target_text = progress.target === null ? "" : ` / ${format_nutrient(info, progress.target, energy)}`;
    return {
      label: info.label,
      href: null,
      value_text: `${shown}${target_text}${progress.over ? " · over" : ""}`,
      percent: progress.percent,
      color: progress.over ? "var(--status-danger)" : "var(--accent)",
      marks: [],
      title: progress.target === null ? "No target" : progress.over ? `Over the ${shown_unit(info, energy)} target` : null,
    };
  });
}

// The nutrients Settings shows, a heading over each group after the first.
export function NutrientTotals({ totals, settings, energy }: { totals: Nutrients; settings: Record<string, unknown>; energy: EnergyUnit }) {
  const shown = shown_nutrients(settings);
  const groups = nutrient_groups.map((group) => ({ ...group, infos: shown.filter((info) => info.group === group.id) })).filter((group) => group.infos.length > 0);
  if (groups.length === 0) return <Empty title="No nutrients are shown." hint="Switch some on in Settings." />;
  return (
    <div className="stack">
      {groups.map((group, index) => (
        <div key={group.id} className="stack tight">
          {index > 0 && <h3>{group.label}</h3>}
          <Meters rows={target_meters(totals, settings, energy, group.infos)} message="Nothing tracked." />
        </div>
      ))}
    </div>
  );
}

// ── Meals ────────────────────────────────────────────────────────────────────

export interface MealRow extends MealMacros {
  id: string;
  name: string;
  share: number;
}

// The meal list as Select options.
export function meal_options(meals: Meal[]): [string, string][] {
  return meals.map((meal): [string, string] => [meal.id, meal.name]);
}

// How the energy split between the meals: a ring of each meal's part, and each meal's energy against its share of the
// target with its macros.
export function MealSplit({ rows, target, energy, title }: { rows: MealRow[]; target: number; energy: EnergyUnit; title: string }) {
  const total = rows.reduce((sum, row) => sum + row.calories, 0);
  const grams = (value: number) => `${format_amount(Number(value.toFixed(1)))} g`;
  const columns: TableColumn<MealRow>[] = [
    { label: "Meal", id: "name", cell: (row) => row.name },
    { label: "Energy", id: "calories", class: "number", cell: (row) => format_measure(row.calories, energy, 0) },
    { label: "Of the day", id: "part", class: "number", cell: (row) => (total > 0 ? `${Math.round((row.calories / total) * 100)}%` : "—") },
    {
      label: "Target",
      id: "target",
      class: "number",
      cell: (row) => (row.share > 0 && target > 0 ? `${format_measure((target * row.share) / 100, energy, 0)} (${format_amount(row.share)}%)` : "—"),
    },
    { label: "Protein", id: "protein", class: "number", cell: (row) => grams(row.protein) },
    { label: "Carbs", id: "carbs", class: "number", cell: (row) => grams(row.carbs) },
    { label: "Fat", id: "fat", class: "number", cell: (row) => grams(row.fat) },
  ];
  return (
    <div className="stack">
      <Donut
        title={title}
        parts={rows.map((row, index) => ({ label: row.name, value: Math.round(to_shown(row.calories, energy)), color: `var(--series-${(index % 6) + 1})` }))}
        center={Math.round(to_shown(total, energy)).toLocaleString()}
        center_label={energy}
        message="Nothing eaten yet."
      />
      <DataTable caption="Each meal" columns={columns} rows={rows} row_key={(row) => row.id} />
    </div>
  );
}

// ── Logging ──────────────────────────────────────────────────────────────────

function LogForm({ date, data, meals }: { date: string; data: DietData; meals: Meal[] }) {
  const [meal, set_meal] = useState(() => meal_at(meals, new Date()));
  const [kind, set_kind] = useState<EntryKind>("food");
  const [ref_id, set_ref_id] = useState("");
  const [amount, set_amount] = useState<number | null>(1);
  const [unit, set_unit] = useState(serving_unit);
  const foods = useMemo(() => by_id(data.foods), [data.foods]);

  function choose(id: string): void {
    set_ref_id(id);
    set_unit(serving_unit);
  }

  async function log(): Promise<void> {
    const id = await attempt(() => calls().add_diary_entry({ date, kind, ref_id, amount: amount ?? 1, unit: kind === "food" ? unit : "", meal }));
    if (!id) return;
    set_ref_id("");
    set_amount(1);
    set_unit(serving_unit);
  }

  return (
    <form
      className="toolbar diet-log"
      onSubmit={(event) => {
        event.preventDefault();
        void log();
      }}
    >
      <Select label="Meal" bare options={meal_options(meals)} value={meals.some((item) => item.id === meal) ? meal : meals[0]!.id} on_change={set_meal} />
      <Segmented
        label="Log a"
        choices={[{ value: "food", label: "Food" }, { value: "recipe", label: "Recipe" }]}
        value={kind}
        on_change={(next) => {
          set_kind(next);
          choose("");
        }}
      />
      <CategorizedSelect<Food | Recipe> label={kind === "food" ? "Food" : "Recipe"} items={kind === "food" ? data.foods : data.recipes} label_of={food_label} categories={data.categories} value={ref_id} placeholder={`Select ${kind}…`} on_change={choose} />
      <NumberField label="Amount" bare min={0.01} value={amount} on_change={set_amount} />
      {kind === "food" && ref_id && <FoodUnitSelect label="Unit" food={foods[ref_id]} value={unit} on_change={set_unit} />}
      <button type="submit" className="accent solid" disabled={!ref_id}>Log</button>
    </form>
  );
}

// Only what an entry is made of, so putting it back after a remove keeps its id and time.
function entry_input({ id, date, kind, ref_id, amount, unit, logged_at, meal }: DayEntry) {
  return { id, date, kind, ref_id, amount, unit, logged_at, meal };
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function DiaryTab({ data, settings, energy }: { data: DietData; settings: Record<string, unknown>; energy: EnergyUnit }) {
  const [date, set_date] = use_pref("x-fitness-diet-day", today(), is_day, session_storage());
  const day = use_data((api) => api.get_diary_day(date), [date]);
  const eat_back = settings["calculators.eat_back_workouts"] === true;
  const workouts = use_data((api) => (eat_back ? api.list_workout_energy(date, date) : Promise.resolve([])), [date, eat_back]);
  const burned = (workouts.data ?? []).reduce((sum, workout) => sum + (workout.calories ?? 0), 0);
  // The day's workouts raise its calorie target when Workouts → Training says to eat them back.
  const day_settings = burned > 0 ? { ...settings, [target_key("calories")]: target_of(settings, "calories") + burned } : settings;
  const meals = useMemo(() => normalize_meals(settings["diet.meals"]), [settings]);

  async function remove(entry: DayEntry): Promise<void> {
    if (!(await succeeds(() => calls().remove_diary_entry(entry.id)))) return;
    toast(`Removed ${entry.label}`, { action: { text: "Undo", run: () => void attempt(() => calls().add_diary_entry(entry_input(entry))) } });
  }

  const columns = useMemo((): TableColumn<DayEntry>[] => {
    const nutrient = (index: number): TableColumn<DayEntry> => {
      const info = nutrients[index]!;
      return { label: info.label, id: info.key, class: "number", cell: (entry) => format_nutrient(info, entry.nutrients[info.key], energy), sort: (entry) => to_shown_value(info, entry.nutrients[info.key], energy) };
    };
    return [
      { label: "Food or recipe", id: "label", cell: (entry) => (entry.found ? entry.label : <span className="muted">{entry.label}</span>) },
      { label: "Amount", id: "amount", cell: (entry) => `${format_amount(entry.amount)} ${entry.unit_label}` },
      nutrient(0),
      nutrient(1),
      nutrient(2),
      nutrient(3),
      row_actions_column<DayEntry>({
        name: (entry) => entry.label,
        buttons: (entry) => <Select label={`Meal of ${entry.label}`} bare options={meal_options(meals)} value={entry.meal} on_change={(meal) => void attempt(() => calls().move_diary_entry(entry.id, meal))} />,
        history: (entry) => ({ kind: "diary", item_id: entry.id }),
        remove: (entry) => void remove(entry),
        remove_text: "Remove",
        width: 330,
      }),
    ];
  }, [energy, meals]);

  return (
    <div className="stack">
      <Toolbar>
        <PeriodStepper label="Day" period="day" value={date} on_change={set_date} />
      </Toolbar>
      <Loaded resource={day}>
        {(loaded) => (
          <>
            <Section title="Day totals">
              {burned > 0 && <p className="muted">{`The calorie target includes ${format_measure(burned, energy, 0)} burned in workouts.`}</p>}
              <NutrientTotals totals={loaded.totals} settings={day_settings} energy={energy} />
            </Section>
            {loaded.entries.length > 0 && (
              <Section title="Meals">
                <MealSplit
                  rows={loaded.meals.map((meal) => ({ id: meal.id, name: meal.name, share: meal.share, calories: meal.totals.calories, protein: meal.totals.protein, carbs: meal.totals.carbs, fat: meal.totals.fat }))}
                  target={target_of(day_settings, "calories")}
                  energy={energy}
                  title="Energy from each meal"
                />
              </Section>
            )}
            <Section title="Eaten">
              <div className="stack tight">
                {loaded.entries.length === 0 ? (
                  <Empty title="Nothing logged for this day." />
                ) : (
                  <DataTable
                    caption="Eaten"
                    columns={columns}
                    rows={loaded.entries}
                    groups={loaded.meals
                      .map((meal) => ({ key: meal.id, label: `${meal.name} · ${format_measure(meal.totals.calories, energy, 0)}`, rows: loaded.entries.filter((entry) => entry.meal === meal.id) }))
                      .filter((group) => group.rows.length > 0)}
                    row_key={(entry) => entry.id}
                  />
                )}
                <LogForm date={date} data={data} meals={meals} />
              </div>
            </Section>
          </>
        )}
      </Loaded>
    </div>
  );
}
