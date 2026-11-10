// The Grocery tab: a shopping list of foods kept by hand, one line per food with its own amount, unit, brand and comment,
// ticked off as it is bought.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { CommitInput, NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { by_id, food_units, normalize_names, type Food, type GroceryItem } from "../../shared/diet/model.ts";
import type { DietData, GroceryChanges } from "../../shared/diet/store.ts";
import { calls } from "../api.ts";
import { ComboInput } from "./controls.tsx";
import { attempt } from "./format.ts";
import { GroupToggle, ItemSelect, category_groups, type ListRow } from "./widgets.tsx";

// ── Lines ────────────────────────────────────────────────────────────────────

// The shared units with the ones the food itself defines.
function units_for(food: Food | undefined, units: string[]): string[] {
  return food ? normalize_names([...units, ...food_units(food).map((unit) => unit.unit)]) : units;
}

// A field of a line that saves once a suggestion is taken, Enter is pressed or the field is left.
function LineCombo({ label, value, suggestions, on_save }: { label: string; value: string; suggestions: string[]; on_save: (value: string) => void }) {
  const [draft, set_draft] = useState(value);
  const save = (next: string) => {
    if (next !== value) on_save(next);
  };
  return <ComboInput label={label} value={draft} suggestions={suggestions} on_change={set_draft} on_pick={(picked) => { set_draft(picked); save(picked); }} on_enter={() => save(draft)} on_blur={() => save(draft)} />;
}

function update(id: string, changes: GroceryChanges): void {
  void attempt(() => calls().update_grocery_item(id, changes));
}

// ── Adding ───────────────────────────────────────────────────────────────────

function AddLine({ data, foods, prefill_comment }: { data: DietData; foods: Record<string, Food>; prefill_comment: boolean }) {
  const [food_id, set_food_id] = useState("");
  const [amount, set_amount] = useState<number | null>(1);
  const [unit, set_unit] = useState("");
  const [brand, set_brand] = useState("");
  const [comment, set_comment] = useState("");
  const on_list = useMemo(() => new Set(data.grocery.map((item) => item.food_id)), [data.grocery]);
  const food = foods[food_id];

  // Picking a food offers its own unit, brand and, when Settings asks, comment until they are typed over; the line keeps its own copy.
  function choose(id: string): void {
    set_food_id(id);
    set_unit(foods[id]?.serving_unit ?? "");
    set_brand(foods[id]?.brand ?? "");
    if (prefill_comment) set_comment(foods[id]?.comment ?? "");
  }

  async function add(): Promise<void> {
    if (!food_id) return;
    const id = await attempt(() => calls().add_grocery_item({ food_id, amount: amount ?? 1, unit, brand, comment }));
    if (!id) return;
    set_food_id("");
    set_amount(1);
    set_unit("");
    set_brand("");
    set_comment("");
  }

  return (
    <form
      className="toolbar diet-log"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <ItemSelect label="Food" items={data.foods} categories={data.categories} value={food_id} placeholder="Select food…" empty_label="Every food is already listed" exclude={on_list} on_change={choose} />
      <NumberField label="Amount" bare min={0.01} value={amount} on_change={set_amount} />
      <ComboInput label="Unit" placeholder="Unit" value={unit} suggestions={units_for(food, data.units)} on_change={set_unit} on_enter={() => void add()} />
      <ComboInput label="Brand" placeholder="Brand" value={brand} suggestions={data.brands} on_change={set_brand} on_enter={() => void add()} />
      <input type="text" aria-label="Comment" placeholder="Comment (optional)" value={comment} onChange={(event) => set_comment(event.currentTarget.value)} />
      <button type="submit" className="accent solid" disabled={!food_id}>Add</button>
    </form>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function GroceryTab({ data, settings }: { data: DietData; settings: Record<string, unknown> }) {
  const [grouped, set_grouped] = use_pref("x-fitness-diet-group-grocery", false, (value): value is boolean => typeof value === "boolean");
  const foods = useMemo(() => by_id(data.foods), [data.foods]);
  const done_count = data.grocery.filter((item) => item.done).length;

  // Every column but the food's name has a fixed width that holds its field, so the fitted table keeps Remove in view.
  const columns = useMemo((): TableColumn<ListRow<GroceryItem>>[] => {
    const name_of = (item: GroceryItem) => foods[item.food_id]?.name ?? "(deleted food)";
    return [
      {
        label: "Bought",
        id: "done",
        width: 70,
        cell: ({ item }) => <input type="checkbox" aria-label={`Bought ${name_of(item)}`} checked={item.done} onChange={(event) => update(item.id, { done: event.currentTarget.checked })} />,
      },
      { label: "Food", id: "food", cell: ({ item }) => (item.done ? <s className="muted">{name_of(item)}</s> : name_of(item)) },
      { label: "Brand", id: "brand", width: 140, cell: ({ item }) => <LineCombo key={item.brand} label={`Brand of ${name_of(item)}`} value={item.brand} suggestions={data.brands} on_save={(brand) => update(item.id, { brand })} /> },
      { label: "Amount", id: "amount", width: 180, cell: ({ item }) => <NumberField label={`Amount of ${name_of(item)}`} bare min={0.01} value={item.amount} on_change={(amount) => amount && update(item.id, { amount })} /> },
      { label: "Unit", id: "unit", width: 100, cell: ({ item }) => <LineCombo key={item.unit} label={`Unit of ${name_of(item)}`} value={item.unit} suggestions={units_for(foods[item.food_id], data.units)} on_save={(unit) => update(item.id, { unit })} /> },
      { label: "Comment", id: "comment", width: 220, cell: ({ item }) => <CommitInput type="text" aria-label={`Comment on ${name_of(item)}`} placeholder="Comment" value={item.comment} on_commit={(event) => event.currentTarget.value !== item.comment && update(item.id, { comment: event.currentTarget.value })} /> },
      {
        label: "Actions",
        id: "actions",
        header: <span className="visually-hidden">Actions</span>,
        class: "actions-cell",
        width: 100,
        cell: ({ item }) => (
          <div className="row-actions">
            <button type="button" className="danger" aria-label={`Remove ${name_of(item)}`} onClick={() => void attempt(() => calls().remove_grocery_item(item.id))}>Remove</button>
          </div>
        ),
      },
    ];
  }, [foods, data.brands, data.units]);

  const groups = useMemo(
    () => (grouped ? category_groups(data.grocery, data.categories, (item) => foods[item.food_id]?.categories ?? [], (item) => item.id) : undefined),
    [grouped, data.grocery, data.categories, foods],
  );
  const rows = useMemo(() => data.grocery.map((item) => ({ key: item.id, item })), [data.grocery]);

  return (
    <div className="stack tight">
      <AddLine data={data} foods={foods} prefill_comment={settings["diet.prefill_grocery_comment"] === true} />
      <Toolbar>
        <GroupToggle checked={grouped} on_change={set_grouped} />
        <button type="button" disabled={done_count === 0} onClick={() => void attempt(() => calls().clear_bought_groceries())}>Clear checked ({done_count})</button>
      </Toolbar>
      {data.grocery.length === 0 ? <p className="muted">Nothing on the list.</p> : <DataTable caption="Grocery list" columns={columns} rows={rows} groups={groups} row_key={(row) => row.key} wrap_class="fit" />}
    </div>
  );
}
