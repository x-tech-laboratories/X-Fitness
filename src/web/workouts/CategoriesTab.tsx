// Categories, shared by exercises and sessions, nesting with "/": made here or typed into a form, renamed with their
// subtree, merged by renaming onto one in use, and deleted with their subtree while the items stay.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from "react";
import { confirm_dialog, Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { ComboField } from "@x-tech-laboratories/x-libs/web/react/suggestions";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import type { CategoryUsage } from "../../shared/workouts/store.ts";
import { calls, use_data } from "../api.ts";

// ── Tab ──────────────────────────────────────────────────────────────────────

// A count, with the subtree's beside it when that is more.
function count_with_tree(own: number, tree: number): string {
  return own === tree ? String(own) : `${own} (${tree})`;
}

export function CategoriesTab() {
  const categories = use_data((api) => api.list_workout_categories());
  const [draft, set_draft] = useState("");
  const [renaming, set_renaming] = useState<{ from: string; to: string } | null>(null);

  async function add(): Promise<void> {
    if (!draft.trim()) return;
    await calls().add_workout_category(draft);
    set_draft("");
  }

  function remove(category: CategoryUsage): void {
    const used = category.exercises_in_tree + category.sessions_in_tree > 0;
    confirm_dialog({
      title: `Delete ${category.name}?`,
      message: used
        ? `It is taken off ${category.exercises_in_tree} exercise(s) and ${category.sessions_in_tree} session(s), with any subcategories. The exercises and sessions are kept.`
        : "Any subcategories go with it.",
      confirm_label: "Delete",
      danger: true,
      run: () => calls().delete_workout_category(category.name),
    });
  }

  const columns: TableColumn<CategoryUsage>[] = [
    { label: "Category", cell: (category) => <span className="workouts-indent" style={{ "--depth": category.depth } as CSSProperties}>{category.leaf}</span> },
    { label: "Exercises", cell: (category) => count_with_tree(category.exercises, category.exercises_in_tree) },
    { label: "Sessions", cell: (category) => count_with_tree(category.sessions, category.sessions_in_tree) },
    {
      label: "",
      id: "actions",
      class: "actions-cell",
      cell: (category) => (
        <span className="row-actions">
          <button type="button" onClick={() => set_renaming({ from: category.name, to: category.name })} aria-label={`Rename ${category.name}`}>
            Rename
          </button>
          <button type="button" className="danger" onClick={() => remove(category)} aria-label={`Delete ${category.name}`}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <Loaded resource={categories}>
      {(list) => (
        <>
          <Toolbar>
            <span className="workouts-inline">
              <ComboField label="New category" placeholder="New category (use / to nest)…" value={draft} options={list.map((category) => category.name)} list_on_focus={false} on_change={set_draft} on_enter={() => void add()} />
              <button type="button" className="accent solid" disabled={!draft.trim()} onClick={() => void add()}>
                Add
              </button>
            </span>
          </Toolbar>
          {list.length === 0 ? <Empty title="No categories." hint="Exercises and sessions share them; Push/Chest is Chest inside Push." /> : <DataTable columns={columns} rows={list} row_key={(category) => category.name} />}
          {renaming && (
            <Dialog
              title={`Rename ${renaming.from}`}
              on_close={() => set_renaming(null)}
              form={{
                on_submit: () => void calls().rename_workout_category(renaming.from, renaming.to).then(() => set_renaming(null)),
                submit_label: "Rename",
              }}
              buttons={
                <button type="button" onClick={() => set_renaming(null)}>
                  Cancel
                </button>
              }
            >
              <p className="muted small">Its subcategories move with it; a name already in use merges the two.</p>
              <input type="text" aria-label="Category name" autoFocus value={renaming.to} onChange={(event) => set_renaming({ ...renaming, to: event.currentTarget.value })} />
            </Dialog>
          )}
        </>
      )}
    </Loaded>
  );
}
