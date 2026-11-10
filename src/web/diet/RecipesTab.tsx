// The Recipes tab: recipes built from the foods, their nutrition per serving worked out from the ingredients, and the
// form that adds or edits one.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, PageHeading, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { ComboField } from "@x-tech-laboratories/x-libs/web/react/suggestions";

import { by_id, food_label, normalize_recipe, nutrients, recipe_nutrients_per_serving, type FoodsById, type Ingredient, type Nutrients, type Recipe } from "../../shared/diet/model.ts";
import type { DietData } from "../../shared/diet/store.ts";
import { calls } from "../api.ts";
import { attempt, format_amount, format_nutrient } from "./format.ts";
import { CategoryEditor, CategoryFilter, FoodUnitSelect, GroupToggle, ItemSelect, use_category_view, with_draft, type ListRow } from "./widgets.tsx";

// ── Form ─────────────────────────────────────────────────────────────────────

// "400 kcal, 12.5 g protein, 50.0 g carbs, 9.0 g fat"
export function macros_text(values: Nutrients, energy: EnergyUnit): string {
  return nutrients
    .slice(0, 4)
    .map((info, index) => (index === 0 ? format_nutrient(info, values[info.key], energy) : `${format_nutrient(info, values[info.key], energy)} ${info.label.toLowerCase()}`))
    .join(", ");
}

function IngredientRows({ ingredients, foods, on_change }: { ingredients: Ingredient[]; foods: FoodsById; on_change: (ingredients: Ingredient[]) => void }) {
  const set_ingredient = (index: number, changes: Partial<Ingredient>) => on_change(ingredients.map((ingredient, position) => (position === index ? { ...ingredient, ...changes } : ingredient)));
  if (ingredients.length === 0) return <p className="muted">No ingredients yet.</p>;
  return (
    <ul className="plain-list" aria-label="Ingredients">
      {ingredients.map((ingredient, index) => {
        const food = foods[ingredient.food_id];
        const name = food ? food_label(food) : "(deleted food)";
        return (
          <li key={index} className="diet-inline diet-ingredient">
            <span className="diet-grow">{name}</span>
            <NumberField label={`Amount of ${name}`} bare min={0.01} value={ingredient.amount} on_change={(amount) => set_ingredient(index, { amount: amount ?? 1 })} />
            <FoodUnitSelect label={`Unit of ${name}`} food={food} value={ingredient.unit || food?.serving_unit || ""} on_change={(unit) => set_ingredient(index, { unit })} />
            <button type="button" className="icon remove" aria-label={`Remove ${name}`} onClick={() => on_change(ingredients.filter((_, position) => position !== index))}>×</button>
          </li>
        );
      })}
    </ul>
  );
}

export function RecipeForm({ initial, data, energy, on_done }: { initial: Recipe | null; data: DietData; energy: EnergyUnit; on_done: () => void }) {
  const [recipe, set_recipe] = useState<Recipe>(() => initial ?? normalize_recipe({}));
  const [draft, set_draft] = useState("");
  const [adding, set_adding] = useState("");
  const [saving, set_saving] = useState(false);
  const foods = useMemo(() => by_id(data.foods), [data.foods]);
  const per_serving = useMemo(() => recipe_nutrients_per_serving(recipe, foods), [recipe, foods]);
  const change = (changes: Partial<Recipe>) => set_recipe((current) => ({ ...current, ...changes }));

  function add_ingredient(): void {
    const food = foods[adding];
    if (!food) return;
    change({ ingredients: [...recipe.ingredients, { food_id: food.id, amount: food.serving_size, unit: food.serving_unit }] });
    set_adding("");
  }

  async function save(): Promise<void> {
    set_saving(true);
    const id = await attempt(() => calls().save_recipe({ ...recipe, categories: with_draft(recipe.categories, draft) }), `Saved ${recipe.name.trim()}`);
    set_saving(false);
    if (id) on_done();
  }

  return (
    <>
      <PageHeading level={2} title={initial ? "Edit recipe" : "Add recipe"} />
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="form-rows">
          <FormRow label="Name" id="diet-recipe-name">
            <input id="diet-recipe-name" type="text" value={recipe.name} onChange={(event) => change({ name: event.currentTarget.value })} />
          </FormRow>
          <FormRow label="Servings" id="diet-recipe-unit">
            <div className="diet-inline">
              <NumberField label="Servings" bare min={0.01} value={recipe.servings} on_change={(servings) => change({ servings: servings ?? 1 })} />
              <ComboField id="diet-recipe-unit" label="Serving unit" placeholder="serving, bowl, slice…" value={recipe.serving_unit} options={data.units} on_change={(serving_unit) => change({ serving_unit })} />
            </div>
          </FormRow>
          <FormRow label="Categories" id="diet-recipe-categories">
            <CategoryEditor categories={recipe.categories} draft={draft} suggestions={data.categories} on_change={(categories) => change({ categories })} on_draft_change={set_draft} />
          </FormRow>
          <FormRow label="Comment" id="diet-recipe-comment">
            <textarea id="diet-recipe-comment" rows={4} placeholder="Notes about this recipe" value={recipe.comment} onChange={(event) => change({ comment: event.currentTarget.value })} />
          </FormRow>
          <FormRow label="Ingredients" id="diet-recipe-ingredient">
            <div className="stack tight">
              <IngredientRows ingredients={recipe.ingredients} foods={foods} on_change={(ingredients) => change({ ingredients })} />
              <div className="diet-inline">
                <ItemSelect id="diet-recipe-ingredient" label="Ingredient to add" items={data.foods} categories={data.categories} value={adding} placeholder="Add ingredient…" on_change={set_adding} />
                <button type="button" disabled={!adding} onClick={add_ingredient}>Add ingredient</button>
              </div>
            </div>
          </FormRow>
        </div>
        <p className="banner" role="status" aria-label="Per serving">
          <strong>Per serving:</strong> {macros_text(per_serving, energy)}
        </p>
        <div className="form-actions diet-inline">
          <button type="submit" className="accent solid" disabled={!recipe.name.trim() || saving}>Save</button>
          <button type="button" onClick={on_done}>Cancel</button>
        </div>
      </form>
    </>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function RecipesTab({ data, energy }: { data: DietData; energy: EnergyUnit }) {
  const [editing, set_editing] = useState<Recipe | "new" | null>(null);
  const view = use_category_view(data.recipes, data.categories, "x-fitness-diet-group-recipes");
  const foods = useMemo(() => by_id(data.foods), [data.foods]);

  const columns = useMemo((): TableColumn<ListRow<Recipe>>[] => {
    const per_serving = (recipe: Recipe) => recipe_nutrients_per_serving(recipe, foods);
    const [energy_info, protein_info] = [nutrients[0]!, nutrients[1]!];
    return [
      { label: "Name", id: "name", cell: (row) => row.item.name, sort: (row) => row.item.name.toLowerCase() },
      { label: "Comment", id: "comment", cell: (row) => row.item.comment, sort: (row) => row.item.comment.toLowerCase() },
      { label: "Categories", id: "categories", cell: (row) => row.item.categories.join(", "), sort: (row) => row.item.categories.join(", ").toLowerCase() },
      { label: "Servings", id: "servings", cell: (row) => `${format_amount(row.item.servings)} ${row.item.serving_unit}`, sort: (row) => row.item.servings },
      { label: "Calories / serving", id: "calories", class: "number", cell: (row) => format_nutrient(energy_info, per_serving(row.item).calories, energy), sort: (row) => per_serving(row.item).calories },
      { label: "Protein / serving", id: "protein", class: "number", cell: (row) => format_nutrient(protein_info, per_serving(row.item).protein, energy), sort: (row) => per_serving(row.item).protein },
      {
        label: "Actions",
        id: "actions",
        header: <span className="visually-hidden">Actions</span>,
        class: "actions-cell",
        width: 150,
        cell: (row) => (
          <div className="row-actions">
            <button type="button" aria-label={`Edit ${row.item.name}`} onClick={() => set_editing(row.item)}>Edit</button>
            <button
              type="button"
              className="danger"
              aria-label={`Delete ${row.item.name}`}
              onClick={() =>
                confirm_dialog({
                  title: "Delete recipe",
                  message: `Delete ${row.item.name}? Diary entries that use it will show it as deleted.`,
                  confirm_label: "Delete",
                  danger: true,
                  run: async () => void (await attempt(() => calls().delete_recipe(row.item.id))),
                })
              }
            >
              Delete
            </button>
          </div>
        ),
      },
    ];
  }, [foods, energy]);

  if (editing) return <RecipeForm initial={editing === "new" ? null : editing} data={data} energy={energy} on_done={() => set_editing(null)} />;

  return (
    <div className="stack tight">
      <Toolbar>
        <button type="button" className="accent solid" onClick={() => set_editing("new")}>Add recipe</button>
        <CategoryFilter categories={data.categories} value={view.filter} on_change={view.set_filter} />
        <GroupToggle checked={view.grouped} on_change={view.set_grouped} />
      </Toolbar>
      {view.rows.length === 0 ? (
        <p className="muted">{view.filter ? "No recipes in this category." : "No recipes yet."}</p>
      ) : (
        <DataTable caption="Recipes" columns={columns} rows={view.rows} groups={view.groups} row_key={(row) => row.key} sorting={view.sorting} on_sort={view.set_sorting} />
      )}
    </div>
  );
}
