// The Categories and Units tabs: the category tree and the unit list foods, recipes and grocery lines share, each made
// ahead of use, renamed everywhere at once and deleted; categories are opened like folders and moved or nested.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import type { PlacedCategory } from "../../shared/category_tree.ts";
import { category_usage, unit_usage } from "../../shared/diet/model.ts";
import type { DietData } from "../../shared/diet/store.ts";
import { calls } from "../api.ts";
import { CategoryManager, RenameField } from "../categories.tsx";
import { attempt, succeeds } from "./format.ts";

// ── Naming ───────────────────────────────────────────────────────────────────

function NewName({ label, on_add }: { label: string; on_add: (name: string) => Promise<boolean> }) {
  const [draft, set_draft] = useState("");
  return (
    <form
      className="toolbar diet-log"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim()) void on_add(draft).then((added) => added && set_draft(""));
      }}
    >
      <input type="text" aria-label={`New ${label.toLowerCase()}`} placeholder={`New ${label.toLowerCase()}…`} value={draft} onChange={(event) => set_draft(event.currentTarget.value)} />
      <button type="submit" className="accent solid" disabled={!draft.trim()}>Add {label.toLowerCase()}</button>
    </form>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

export function CategoriesTab({ data }: { data: DietData }) {
  const usage = (category: PlacedCategory, with_nested: boolean) => category_usage(data.foods, data.recipes, category.id, data.categories, with_nested);
  const count = (category: PlacedCategory, kind: "foods" | "recipes") => {
    const direct = usage(category, false)[kind];
    const nested = usage(category, true)[kind];
    return (
      <>
        {direct}
        {nested > direct && <span className="muted small"> ({nested} with nested)</span>}
      </>
    );
  };
  const count_columns: TableColumn<PlacedCategory>[] = [
    { label: "Foods", id: "foods", class: "number", cell: (category) => count(category, "foods") },
    { label: "Recipes", id: "recipes", class: "number", cell: (category) => count(category, "recipes") },
  ];

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
  const [editing, set_editing] = useState<string | null>(null);

  function finish_rename(from: string, to: string | null): void {
    set_editing(null);
    const target = to?.trim() ?? "";
    if (target && target !== from) void attempt(() => calls().rename_unit(from, target));
  }

  const columns = useMemo((): TableColumn<string>[] => {
    const usage = (unit: string) => unit_usage(data.foods, data.recipes, data.grocery, unit);
    return [
      { label: "Unit", id: "name", cell: (unit) => (editing === unit ? <RenameField label={`Rename ${unit}`} value={unit} on_done={(to) => finish_rename(unit, to)} /> : unit) },
      { label: "Foods", id: "foods", class: "number", cell: (unit) => usage(unit).foods },
      { label: "Recipes", id: "recipes", class: "number", cell: (unit) => usage(unit).recipes },
      { label: "Grocery", id: "grocery", class: "number", cell: (unit) => usage(unit).grocery },
      {
        label: "Actions",
        id: "actions",
        header: <span className="visually-hidden">Actions</span>,
        class: "actions-cell",
        width: 170,
        cell: (unit) => (
          <div className="row-actions">
            <button type="button" aria-label={`Rename ${unit}`} onClick={() => set_editing(unit)}>Rename</button>
            <button type="button" className="danger" aria-label={`Delete ${unit}`} onClick={() => void succeeds(() => calls().delete_unit(unit))}>Delete</button>
          </div>
        ),
      },
    ];
  }, [data, editing]);

  return (
    <div className="stack tight">
      <NewName label="Unit" on_add={(name) => succeeds(() => calls().add_unit(name))} />
      {data.units.length === 0 ? <p className="muted">No units yet.</p> : <DataTable caption="Units" columns={columns} rows={data.units} row_key={(unit) => unit} />}
      <p className="muted small">
        Renaming updates every food, recipe and grocery line using the unit. Renaming onto an existing unit merges the two. A unit still in use cannot be deleted:
        rename it onto another unit first, which moves everything over.
      </p>
    </div>
  );
}
