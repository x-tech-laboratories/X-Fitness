// The Diary tab: one day's foods and recipes, their totals against the day's targets, and logging what was eaten.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { format_local } from "@x-tech-laboratories/x-libs/dates";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { Meters, type Meter } from "@x-tech-laboratories/x-libs/web/react/charts";
import { NumberField, PeriodStepper, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Section, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { by_id, nutrients, serving_unit, target_key, target_progress, type EntryKind, type Nutrients } from "../../shared/diet/model.ts";
import type { DayEntry, DietData } from "../../shared/diet/store.ts";
import { calls, use_data } from "../api.ts";
import { HistoryButton } from "../history/HistoryView.tsx";
import { attempt, format_amount, format_nutrient, shown_unit, succeeds, to_shown_value } from "./format.ts";
import { FoodUnitSelect, ItemSelect } from "./widgets.tsx";

// ── Dates ────────────────────────────────────────────────────────────────────

export function today(): string {
  return format_local(new Date(), false);
}

function is_date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// The day shown is kept for this tab's session, so it survives a visit to another tab and starts at today next time.
function session_storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

// ── Totals ───────────────────────────────────────────────────────────────────

export function target_meters(totals: Nutrients, settings: Record<string, unknown>, energy: EnergyUnit): Meter[] {
  return nutrients.map((info) => {
    const value = totals[info.key];
    const progress = target_progress(value, Number(settings[target_key(info.key)] ?? 0));
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

// ── Logging ──────────────────────────────────────────────────────────────────

function LogForm({ date, data }: { date: string; data: DietData }) {
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
    const id = await attempt(() => calls().add_diary_entry({ date, kind, ref_id, amount: amount ?? 1, unit: kind === "food" ? unit : "" }));
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
      <Segmented
        label="Log a"
        choices={[{ value: "food", label: "Food" }, { value: "recipe", label: "Recipe" }]}
        value={kind}
        on_change={(next) => {
          set_kind(next);
          choose("");
        }}
      />
      <ItemSelect label={kind === "food" ? "Food" : "Recipe"} items={kind === "food" ? data.foods : data.recipes} categories={data.categories} value={ref_id} placeholder={`Select ${kind}…`} on_change={choose} />
      <NumberField label="Amount" bare min={0.01} value={amount} on_change={set_amount} />
      {kind === "food" && ref_id && <FoodUnitSelect label="Unit" food={foods[ref_id]} value={unit} on_change={set_unit} />}
      <button type="submit" className="accent solid" disabled={!ref_id}>Log</button>
    </form>
  );
}

// Only what an entry is made of, so putting it back after a remove keeps its id and time.
function entry_input({ id, date, kind, ref_id, amount, unit, logged_at }: DayEntry) {
  return { id, date, kind, ref_id, amount, unit, logged_at };
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function DiaryTab({ data, settings, energy }: { data: DietData; settings: Record<string, unknown>; energy: EnergyUnit }) {
  const [date, set_date] = use_pref("x-fitness-diet-day", today(), is_date, session_storage());
  const day = use_data((api) => api.get_diary_day(date), [date]);

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
      {
        label: "Actions",
        id: "actions",
        header: <span className="visually-hidden">Actions</span>,
        class: "actions-cell",
        width: 200,
        cell: (entry) => (
          <div className="row-actions">
            <HistoryButton kind="diary" item_id={entry.id} name={entry.label} />
            <button type="button" className="danger" aria-label={`Remove ${entry.label}`} onClick={() => void remove(entry)}>Remove</button>
          </div>
        ),
      },
    ];
  }, [energy]);

  return (
    <div className="stack">
      <Toolbar>
        <PeriodStepper label="Day" period="day" value={date} on_change={set_date} />
      </Toolbar>
      <Loaded resource={day}>
        {(loaded) => (
          <>
            <Section title="Day totals">
              <Meters rows={target_meters(loaded.totals, settings, energy)} message="Nothing tracked." />
            </Section>
            <Section title="Eaten">
              <div className="stack tight">
                {loaded.entries.length === 0 ? <p className="muted">Nothing logged for this day.</p> : <DataTable caption="Eaten" columns={columns} rows={loaded.entries} row_key={(entry) => entry.id} />}
                <LogForm date={date} data={data} />
              </div>
            </Section>
          </>
        )}
      </Loaded>
    </div>
  );
}
