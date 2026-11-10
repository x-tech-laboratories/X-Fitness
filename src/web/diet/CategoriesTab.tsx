// The Categories and Units tabs: the category tree and the unit list foods, recipes and grocery lines share, each made
// ahead of use, renamed everywhere at once and deleted.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { category_depth, category_leaf, category_separator, category_usage, normalize_category_name, unit_usage } from "../../shared/diet/model.ts";
import type { DietData } from "../../shared/diet/store.ts";
import { calls } from "../api.ts";
import { attempt, succeeds } from "./format.ts";
import { indented_category } from "./widgets.tsx";

// ── Renaming ─────────────────────────────────────────────────────────────────

// A name edited in place: Enter or leaving saves it, Escape gives up.
function RenameField({ label, value, on_done }: { label: string; value: string; on_done: (name: string | null) => void }) {
  const [draft, set_draft] = useState(value);
  const keyed = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      on_done(draft);
    } else if (event.key === "Escape") {
      event.preventDefault();
      on_done(null);
    }
  };
  return <input type="text" aria-label={label} autoFocus value={draft} onChange={(event) => set_draft(event.currentTarget.value)} onKeyDown={keyed} onBlur={() => on_done(draft)} />;
}

function NewName({ label, on_add, children }: { label: string; on_add: (name: string) => Promise<boolean>; children?: ReactNode }) {
  const [draft, set_draft] = useState("");
  return (
    <form
      className="toolbar diet-log"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim()) void on_add(draft).then((added) => added && set_draft(""));
      }}
    >
      {children}
      <input type="text" aria-label={`New ${label.toLowerCase()}`} placeholder={`New ${label.toLowerCase()}…`} value={draft} onChange={(event) => set_draft(event.currentTarget.value)} />
      <button type="submit" className="accent solid" disabled={!draft.trim()}>Add {label.toLowerCase()}</button>
    </form>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

export function CategoriesTab({ data }: { data: DietData }) {
  const [parent, set_parent] = useState("");
  const [editing, set_editing] = useState<string | null>(null);

  function finish_rename(from: string, to: string | null): void {
    set_editing(null);
    const target = to === null ? "" : normalize_category_name(to);
    if (target && target !== from) void attempt(() => calls().rename_category(from, target));
  }

  function remove(name: string): void {
    const usage = category_usage(data.foods, data.recipes, name, true);
    const affected = usage.foods + usage.recipes > 0 ? ` It is removed from ${usage.foods} food(s) and ${usage.recipes} recipe(s), including any subcategories.` : " Any subcategories go with it.";
    confirm_dialog({
      title: "Delete category",
      message: `Delete category "${name}"?${affected} The foods and recipes themselves are kept.`,
      confirm_label: "Delete",
      danger: true,
      run: async () => void (await attempt(() => calls().delete_category(name))),
    });
  }

  const columns = useMemo((): TableColumn<string>[] => {
    const count = (name: string, kind: "foods" | "recipes") => {
      const direct = category_usage(data.foods, data.recipes, name);
      const nested = category_usage(data.foods, data.recipes, name, true);
      const has_nested = nested.foods > direct.foods || nested.recipes > direct.recipes;
      return (
        <>
          {direct[kind]}
          {has_nested && <span className="muted small"> ({nested[kind]} with nested)</span>}
        </>
      );
    };
    return [
      {
        label: "Category",
        id: "name",
        cell: (name) =>
          editing === name ? (
            <RenameField label={`Rename ${name}`} value={name} on_done={(to) => finish_rename(name, to)} />
          ) : (
            <span className="diet-group" style={{ "--depth": category_depth(name) } as CSSProperties}>{category_leaf(name)}</span>
          ),
      },
      { label: "Foods", id: "foods", class: "number", cell: (name) => count(name, "foods") },
      { label: "Recipes", id: "recipes", class: "number", cell: (name) => count(name, "recipes") },
      {
        label: "Actions",
        id: "actions",
        header: <span className="visually-hidden">Actions</span>,
        class: "actions-cell",
        width: 170,
        cell: (name) => (
          <div className="row-actions">
            <button type="button" aria-label={`Rename ${name}`} onClick={() => set_editing(name)}>Rename</button>
            <button type="button" className="danger" aria-label={`Delete ${name}`} onClick={() => remove(name)}>Delete</button>
          </div>
        ),
      },
    ];
  }, [data, editing]);

  return (
    <div className="stack tight">
      <NewName label="Category" on_add={(name) => succeeds(() => calls().add_category(parent ? `${parent}${category_separator}${name}` : name))}>
        <Select label="Parent category" bare options={[["", "(top level)"], ...data.categories.map((name): [string, string] => [name, indented_category(name)])]} value={parent} on_change={set_parent} />
      </NewName>
      {data.categories.length === 0 ? <p className="muted">No categories yet.</p> : <DataTable caption="Categories" columns={columns} rows={data.categories} row_key={(name) => name} />}
      <p className="muted small">
        Renaming edits the full path, so it also moves a category and everything nested under it: renaming "Protein" to "Macros/Protein" carries "Protein/Meat" along.
        Renaming onto an existing category merges the two. Deleting removes the category and its subcategories from every food and recipe; the foods and recipes
        themselves are kept.
      </p>
    </div>
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
