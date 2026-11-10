// The Foods tab: the food database by category, and the form that adds or edits a food, filled by hand or from an
// Open Food Facts or USDA lookup.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { NumberField, SearchBox, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, PageHeading, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { ComboField } from "@x-tech-laboratories/x-libs/web/react/suggestions";

import { food_label, food_unit_problems, normalize_food, nutrients, serving_unit, type Food, type Portion } from "../../shared/diet/model.ts";
import type { LookupReply, LookupResult } from "../../shared/diet/lookup.ts";
import type { DietData } from "../../shared/diet/store.ts";
import { calls } from "../api.ts";
import { HistoryButton } from "../history/HistoryView.tsx";
import { attempt, error_text, format_amount, format_nutrient } from "./format.ts";
import { CategoryEditor, CategoryFilter, GroupToggle, NutrientFields, serving_label, use_category_view, with_draft, type ListRow } from "./widgets.tsx";

// ── Form ─────────────────────────────────────────────────────────────────────

interface FoodFormProps {
  initial: Food | null;
  data: DietData;
  energy: EnergyUnit;
  has_usda_key: boolean;
  on_done: () => void;
}

function Lookup({ has_usda_key, on_use }: { has_usda_key: boolean; on_use: (result: LookupResult) => void }) {
  const [reply, set_reply] = useState<LookupReply | null>(null);
  const [searching, set_searching] = useState(false);
  const [failure, set_failure] = useState("");

  async function search(query: string): Promise<void> {
    if (!query.trim()) return set_reply(null);
    set_searching(true);
    set_failure("");
    try {
      set_reply(await calls().search_online_foods(query));
    } catch (error) {
      set_failure(error_text(error));
      set_reply(null);
    } finally {
      set_searching(false);
    }
  }

  const errors = [failure, ...(reply?.errors ?? [])].filter(Boolean);
  return (
    <div className="stack tight">
      <SearchBox label={has_usda_key ? "Search USDA and Open Food Facts" : "Search Open Food Facts"} value="" submit_label="Search" on_submit={(query) => void search(query)} />
      {!has_usda_key && <p className="muted small">Set a USDA FoodData Central API key in Settings to also search USDA.</p>}
      {searching && <p className="muted" role="status">Searching…</p>}
      {errors.map((error) => (
        <p key={error} className="tone-bad" role="alert">{error}</p>
      ))}
      {reply && !searching && (
        <ul className="plain-list diet-results" aria-label="Lookup results">
          {reply.results.length === 0 && <li className="muted">No results.</li>}
          {reply.results.map((result) => (
            <li key={result.key} className="diet-result">
              <span>
                {result.name}
                <span className="muted small"> · {[result.brand, result.source].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" aria-label={`Use ${result.name}`} onClick={() => { on_use(result); set_reply(null); }}>Use</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PortionRows({ food, units, on_change }: { food: Food; units: string[]; on_change: (portions: Portion[]) => void }) {
  const problems = food_unit_problems(food);
  const set_portion = (index: number, changes: Partial<Portion>) => on_change(food.portions.map((portion, position) => (position === index ? { ...portion, ...changes } : portion)));
  return (
    <div className="stack tight">
      {food.portions.length === 0 && (
        <p className="muted small">
          Nutrition is per {format_amount(food.serving_size)} {food.serving_unit}. Add a unit to also log this food as whole pieces, packs or trays. Both sides can be
          counted, and the right side can be another unit defined here, so "4 tray = 30 {food.serving_unit}" and "1 tray = 5 box" both work.
        </p>
      )}
      {food.portions.map((portion, index) => {
        const size_units: [string, string][] = [
          [food.serving_unit, food.serving_unit],
          [serving_unit, serving_label(food)],
          ...food.portions.filter((other) => other.unit && other.unit !== portion.unit && other.unit !== food.serving_unit).map((other): [string, string] => [other.unit, other.unit]),
        ];
        return (
          <div key={index} className="diet-inline diet-portion">
            <NumberField label="How many" bare min={0.01} value={portion.amount} on_change={(amount) => set_portion(index, { amount: amount ?? 1 })} />
            <ComboField label="Unit" placeholder="tortilla" value={portion.unit} options={units} on_change={(unit) => set_portion(index, { unit })} />
            <span aria-hidden="true">=</span>
            <NumberField label="Equals" bare min={0.01} value={portion.size} on_change={(size) => set_portion(index, { size: size ?? 1 })} />
            <Select label="Measured in" bare options={size_units} value={portion.size_unit || food.serving_unit} on_change={(size_unit) => set_portion(index, { size_unit })} />
            <button type="button" className="icon remove" aria-label={`Remove unit ${portion.unit}`} onClick={() => on_change(food.portions.filter((_, position) => position !== index))}>×</button>
          </div>
        );
      })}
      {problems.length > 0 && (
        <p className="tone-bad" role="alert">
          {problems.join(", ")} can't be worked out in {food.serving_unit}: the chain loops or points at a unit that isn't defined here. Those units aren't offered until it's fixed.
        </p>
      )}
      <div>
        <button type="button" onClick={() => on_change([...food.portions, { unit: "", amount: 1, size: food.serving_size, size_unit: "" }])}>Add unit</button>
      </div>
    </div>
  );
}

export function FoodForm({ initial, data, energy, has_usda_key, on_done }: FoodFormProps) {
  const [food, set_food] = useState<Food>(() => initial ?? normalize_food({}));
  const [draft, set_draft] = useState("");
  const [saving, set_saving] = useState(false);
  const change = (changes: Partial<Food>) => set_food((current) => ({ ...current, ...changes }));

  async function save(): Promise<void> {
    set_saving(true);
    const id = await attempt(() => calls().save_food({ ...food, categories: with_draft(food.categories, draft) }), `Saved ${food.name.trim()}`);
    set_saving(false);
    if (id) on_done();
  }

  return (
    <>
      <PageHeading level={2} title={initial ? "Edit food" : "Add food"} />
      <Lookup has_usda_key={has_usda_key} on_use={(result) => change({ name: food.name || result.name, serving_size: result.serving_size, serving_unit: result.serving_unit, nutrients: result.nutrients })} />
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="form-rows">
          <FormRow label="Name" id="diet-food-name">
            <input id="diet-food-name" type="text" value={food.name} onChange={(event) => change({ name: event.currentTarget.value })} />
          </FormRow>
          <FormRow label="Brand" id="diet-food-brand">
            <ComboField id="diet-food-brand" label="Brand" placeholder="Optional" value={food.brand} options={data.brands} on_change={(brand) => change({ brand })} />
          </FormRow>
          <FormRow label="Serving" id="diet-food-serving">
            <div className="diet-inline">
              <NumberField label="Serving size" bare min={0.01} value={food.serving_size} on_change={(size) => change({ serving_size: size ?? 100 })} />
              <ComboField id="diet-food-serving" label="Serving unit" placeholder="g, ml, cup…" value={food.serving_unit} options={data.units} on_change={(serving_unit) => change({ serving_unit })} />
            </div>
          </FormRow>
          <FormRow label="Other units" id="diet-food-units">
            <PortionRows food={food} units={data.units} on_change={(portions) => change({ portions })} />
          </FormRow>
          <FormRow label="Categories" id="diet-food-categories">
            <CategoryEditor categories={food.categories} draft={draft} suggestions={data.categories} on_change={(categories) => change({ categories })} on_draft_change={set_draft} />
          </FormRow>
          <FormRow label="Comment" id="diet-food-comment">
            <textarea id="diet-food-comment" rows={4} placeholder="Notes about this food" value={food.comment} onChange={(event) => change({ comment: event.currentTarget.value })} />
          </FormRow>
        </div>
        <NutrientFields values={food.nutrients} energy={energy} on_change={(key, value) => set_food((current) => ({ ...current, nutrients: { ...current.nutrients, [key]: value } }))} />
        <div className="form-actions diet-inline">
          <button type="submit" className="accent solid" disabled={!food.name.trim() || saving}>Save</button>
          <button type="button" onClick={on_done}>Cancel</button>
        </div>
      </form>
    </>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

// Fixed widths for the short columns leave the rest of the fitted table to the text, so the actions always stay in view.
const number_width = 90;

function food_columns(energy: EnergyUnit, on_edit: (food: Food) => void, on_delete: (food: Food) => void): TableColumn<ListRow<Food>>[] {
  const nutrient = (index: number): TableColumn<ListRow<Food>> => {
    const info = nutrients[index]!;
    return { label: info.label, id: info.key, class: "number", width: number_width, cell: (row) => format_nutrient(info, row.item.nutrients[info.key], energy), sort: (row) => row.item.nutrients[info.key] };
  };
  return [
    { label: "Name", id: "name", hideable: false, cell: (row) => row.item.name, sort: (row) => row.item.name.toLowerCase() },
    { label: "Brand", id: "brand", cell: (row) => row.item.brand, sort: (row) => row.item.brand.toLowerCase() },
    { label: "Comment", id: "comment", cell: (row) => row.item.comment, sort: (row) => row.item.comment.toLowerCase() },
    { label: "Categories", id: "categories", cell: (row) => row.item.categories.join(", "), sort: (row) => row.item.categories.join(", ").toLowerCase() },
    { label: "Serving", id: "serving", width: number_width, cell: (row) => `${format_amount(row.item.serving_size)} ${row.item.serving_unit}`, sort: (row) => row.item.serving_size },
    nutrient(0),
    nutrient(1),
    nutrient(2),
    nutrient(3),
    {
      label: "Actions",
      id: "actions",
      header: <span className="visually-hidden">Actions</span>,
      class: "actions-cell",
      width: 150,
      hideable: false,
      cell: (row) => (
        <div className="row-actions">
          <button type="button" aria-label={`Edit ${food_label(row.item)}`} onClick={() => on_edit(row.item)}>Edit</button>
          <HistoryButton kind="food" item_id={row.item.id} name={food_label(row.item)} />
          <button type="button" className="danger" aria-label={`Delete ${food_label(row.item)}`} onClick={() => on_delete(row.item)}>Delete</button>
        </div>
      ),
    },
  ];
}

export function FoodsTab({ data, energy, has_usda_key }: { data: DietData; energy: EnergyUnit; has_usda_key: boolean }) {
  const [editing, set_editing] = useState<Food | "new" | null>(null);
  const view = use_category_view(data.foods, data.categories, "x-fitness-diet-group-foods");
  const [hidden, set_hidden] = use_pref("x-fitness-diet-food-hidden-columns", ["comment"], (value): value is string[] => Array.isArray(value) && value.every((id) => typeof id === "string"));

  const columns = useMemo(
    () =>
      food_columns(energy, set_editing, (food) =>
        confirm_dialog({
          title: "Delete food",
          message: `Delete ${food_label(food)}? Recipes and diary entries that use it will show it as deleted.`,
          confirm_label: "Delete",
          danger: true,
          run: async () => void (await attempt(() => calls().delete_food(food.id))),
        }),
      ),
    [energy],
  );

  if (editing) return <FoodForm initial={editing === "new" ? null : editing} data={data} energy={energy} has_usda_key={has_usda_key} on_done={() => set_editing(null)} />;

  return (
    <div className="stack tight">
      <Toolbar>
        <button type="button" className="accent solid" onClick={() => set_editing("new")}>Add food</button>
        <CategoryFilter categories={data.categories} value={view.filter} on_change={view.set_filter} />
        <GroupToggle checked={view.grouped} on_change={view.set_grouped} />
      </Toolbar>
      {view.rows.length === 0 ? (
        <p className="muted">{view.filter ? "No foods in this category." : "No foods yet."}</p>
      ) : (
        <DataTable
          caption="Foods"
          columns={columns}
          rows={view.rows}
          groups={view.groups}
          row_key={(row) => row.key}
          sorting={view.sorting}
          on_sort={view.set_sorting}
          hidden_columns={hidden}
          on_hidden_columns_change={set_hidden}
          wrap_class="fit"
        />
      )}
    </div>
  );
}
