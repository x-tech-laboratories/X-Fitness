// The Categories and Units tabs: the category tree and the unit list foods, recipes and grocery lines share, each made
// ahead of use, renamed everywhere at once and deleted; categories are opened like folders and moved or nested.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import type { PlacedCategory } from "../../shared/category_tree.ts";
import { category_usage, unit_usage } from "../../shared/diet/model.ts";
import type { DietData } from "../../shared/diet/store.ts";
import { attempt, calls, succeeds } from "../api.ts";
import { CategoryManager, count_column } from "../categories.tsx";
import { AddNameForm, use_rename } from "../forms.tsx";
import { row_actions_column } from "../rows.tsx";

// ── Categories ───────────────────────────────────────────────────────────────

export function CategoriesTab({ data }: { data: DietData }) {
  const usage = (category: PlacedCategory, with_nested: boolean) => category_usage(data.foods, data.recipes, category.id, data.categories, with_nested);
  const counts = (kind: "foods" | "recipes") => (category: PlacedCategory): [number, number] => [usage(category, false)[kind], usage(category, true)[kind]];
  const count_columns = [count_column("Foods", "foods", counts("foods")), count_column("Recipes", "recipes", counts("recipes"))];

  function describe_delete(category: PlacedCategory): string {
    const nested = usage(category, true);
    const affected = nested.foods + nested.recipes > 0 ? `It is removed from ${nested.foods} food(s) and ${nested.recipes} recipe(s), with everything inside it.` : "Everything inside it goes with it.";
    return `${affected} The foods and recipes themselves are kept.`;
  }

  return (
    <CategoryManager
      categories={data.categories}
      count_columns={count_columns}
      describe_delete={describe_delete}
      calls={{
        add: (name, parent_id) => succeeds(() => calls().add_category(name, parent_id)),
        rename: (id, name) => attempt(() => calls().rename_category(id, name)),
        move: (id, parent_id, position) => attempt(() => calls().move_category(id, parent_id, position)),
        remove: (id) => attempt(() => calls().delete_category(id)),
      }}
    >
      <p className="muted small">
        Open a category to see what is inside it, and follow the trail above to climb back out. Drag a row above or below another to reorder them, or onto
        the middle of one to put it inside; Move does the same from a list. A category renamed or moved next to one with the same name merges into it. Deleting
        removes the category and everything inside it from every food and recipe; the foods and recipes themselves are kept.
      </p>
    </CategoryManager>
  );
}

// ── Units ────────────────────────────────────────────────────────────────────

export function UnitsTab({ data }: { data: DietData }) {
  const rename = use_rename<string>((from, to) => void attempt(() => calls().rename_unit(from, to)));

  const columns = useMemo((): TableColumn<string>[] => {
    const usage = (unit: string) => unit_usage(data.foods, data.recipes, data.grocery, unit);
    return [
      { label: "Unit", id: "name", cell: (unit) => (rename.renaming === unit ? rename.field(unit, unit) : unit) },
      { label: "Foods", id: "foods", class: "number", cell: (unit) => usage(unit).foods },
      { label: "Recipes", id: "recipes", class: "number", cell: (unit) => usage(unit).recipes },
      { label: "Grocery", id: "grocery", class: "number", cell: (unit) => usage(unit).grocery },
      row_actions_column<string>({
        name: (unit) => unit,
        buttons: (unit) => (
          <button type="button" aria-label={`Rename ${unit}`} onClick={() => rename.start(unit)}>
            Rename
          </button>
        ),
        remove: (unit) => void succeeds(() => calls().delete_unit(unit)),
        width: 170,
      }),
    ];
  }, [data, rename.renaming]);

  return (
    <div className="stack tight">
      <AddNameForm label="New unit" button="Add unit" class_name="toolbar diet-log" on_add={(name) => succeeds(() => calls().add_unit(name))} />
      {data.units.length === 0 ? <Empty title="No units yet." /> : <DataTable caption="Units" columns={columns} rows={data.units} row_key={(unit) => unit} />}
      <p className="muted small">
        Renaming updates every food, recipe and grocery line using the unit. Renaming onto an existing unit merges the two. A unit still in use cannot be deleted:
        rename it onto another unit first, which moves everything over.
      </p>
    </div>
  );
}
