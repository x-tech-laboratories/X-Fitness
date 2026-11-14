// The category pieces the Diet and Workouts pages share: the category tree managed one folder at a time, a filter that
// steps into categories the same way, the category picker on a form, and paths shown with chevrons.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";
import { Chip, Chips } from "@x-tech-laboratories/x-libs/web/react/badges";
import { TreeChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { TreeSelect } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Crumbs, PathText, type CrumbTarget } from "@x-tech-laboratories/x-libs/web/react/layout";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { move_for_drop } from "@x-tech-laboratories/x-libs/web/tree";

import { category_path, category_path_text, category_subtree, children_of_category, uncategorized, type Category, type PlacedCategory } from "../shared/category_tree.ts";

// ── Paths ────────────────────────────────────────────────────────────────────

// An item's categories, each as its path with chevrons.
export function CategoryPaths({ ids, categories }: { ids: string[]; categories: Category[] }) {
  return (
    <>
      {ids.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && ", "}
          <PathText names={category_path(id, categories)} />
        </Fragment>
      ))}
    </>
  );
}

// The same as text, such as for sorting or a select's option.
export function category_paths_text(ids: string[], categories: Category[]): string {
  return ids.map((id) => category_path_text(id, categories)).join(", ");
}

// The categories from the top of the tree down to the one given, not counting it.
function ancestors_of(category: Category | null, categories: Category[]): Category[] {
  const ancestors: Category[] = [];
  let parent = categories.find((item) => item.id === category?.parent_id);
  while (parent && !ancestors.includes(parent)) {
    ancestors.unshift(parent);
    parent = categories.find((item) => item.id === parent!.parent_id);
  }
  return ancestors;
}

// "All categories", then each step down to the category given, every step but the last opening its own.
function trail_to(category: Category | null, categories: Category[], open: (id: string | null) => void): [string, CrumbTarget][] {
  const steps = ancestors_of(category, categories).map((step): [string, CrumbTarget] => [step.name, () => open(step.id)]);
  return [["All categories", category ? () => open(null) : null], ...steps, ...(category ? [[category.name, null] as [string, CrumbTarget]] : [])];
}

// ── Picking ──────────────────────────────────────────────────────────────────

// Chips for an item's categories and a field searching the tree for more; text matching none is made a category on save.
export function CategoryEditor({ categories, values, on_change }: { categories: Category[]; values: string[]; on_change: (values: string[]) => void }) {
  return (
    <TreeChipField
      label="Categories"
      items={categories}
      name_of={(category) => category.name}
      values={values}
      on_change={on_change}
      placeholder="Add a category…"
      empty_text="No categories."
      can_create
    />
  );
}

interface CategoryBrowserProps {
  categories: PlacedCategory[];
  // "" for everything, uncategorized for items without a category, or a category's id.
  value: string;
  on_change: (value: string) => void;
  // How many items sit in the category or anywhere below it.
  count_in: (id: string) => number;
  uncategorized_count: number;
}

// A filter opened like folders: the trail back up, and a chip for each category inside the one open.
export function CategoryBrowser({ categories, value, on_change, count_in, uncategorized_count }: CategoryBrowserProps) {
  const open = categories.find((category) => category.id === value) ?? null;
  const is_loose = value === uncategorized;
  const trail: [string, CrumbTarget][] = is_loose ? [["All categories", () => on_change("")], [uncategorized, null]] : trail_to(open, categories, (id) => on_change(id ?? ""));
  const inside = is_loose ? [] : children_of_category(open?.id ?? null, categories);
  const offers_loose = !open && !is_loose && uncategorized_count > 0;
  return (
    <div className="stack tight" role="group" aria-label="Filter by category">
      <Crumbs items={trail} />
      {(inside.length > 0 || offers_loose) && (
        <Chips>
          {inside.map((category) => (
            <Chip key={category.id} on_click={() => on_change(category.id)} title={`Show ${category_path_text(category.id, categories)}`}>
              {category.name} <span className="muted">({count_in(category.id)})</span>
            </Chip>
          ))}
          {offers_loose && (
            <Chip dashed on_click={() => on_change(uncategorized)}>
              {uncategorized} <span className="muted">({uncategorized_count})</span>
            </Chip>
          )}
        </Chips>
      )}
    </div>
  );
}

// ── Managing ─────────────────────────────────────────────────────────────────

// A name edited in place: Enter or leaving saves it, Escape gives up.
export function RenameField({ label, value, on_done }: { label: string; value: string; on_done: (name: string | null) => void }) {
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

function MoveDialog({ category, categories, on_move, on_close }: { category: Category; categories: Category[]; on_move: (parent_id: string | null) => void; on_close: () => void }) {
  const [parent_id, set_parent_id] = useState(category.parent_id ?? "");
  return (
    <Dialog
      title={`Move ${category.name}`}
      on_close={on_close}
      form={{ on_submit: () => on_move(parent_id || null), submit_label: "Move" }}
      buttons={
        <button type="button" onClick={on_close}>
          Cancel
        </button>
      }
    >
      <p className="muted small">Everything inside it moves too; a category of the same name already there merges with it.</p>
      <TreeSelect label="Move into" items={categories} name_of={(item) => item.name} value={parent_id} blank_label="(top level)" disabled_ids={[...category_subtree(category.id, categories)]} on_change={set_parent_id} />
    </Dialog>
  );
}

// Each call's own failure is the caller's to show; add gives false when it failed, so the name stays typed.
export interface CategoryCalls {
  add: (name: string, parent_id: string | null) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  move: (id: string, parent_id: string | null, position: number | null) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

interface CategoryManagerProps<Row extends PlacedCategory> {
  // Every category in tree order, with whatever the count columns read.
  categories: Row[];
  // How many items use each category, such as foods and recipes.
  count_columns: TableColumn<Row>[];
  // What deleting it takes away, said before it goes.
  describe_delete: (category: Row) => string;
  calls: CategoryCalls;
  // A word on renaming, moving and deleting, under the table.
  children?: ReactNode;
}

// The categories inside one at a time, opened like folders with the trail back up; rows drag beside each other to
// reorder or onto one another to nest.
export function CategoryManager<Row extends PlacedCategory>({ categories, count_columns, describe_delete, calls, children }: CategoryManagerProps<Row>) {
  const [open_id, set_open_id] = useState<string | null>(null);
  const [draft, set_draft] = useState("");
  const [renaming, set_renaming] = useState<string | null>(null);
  const [moving, set_moving] = useState<Row | null>(null);
  const [dragged, set_dragged] = useState<Row | null>(null);

  const open = categories.find((category) => category.id === open_id) ?? null;
  const rows = categories.filter((category) => category.parent_id === (open?.id ?? null));
  const inside_count = (row: Row) => categories.filter((category) => category.parent_id === row.id).length;

  function add(): void {
    const name = draft.trim();
    if (name) void calls.add(name, open?.id ?? null).then((added) => added !== false && set_draft(""));
  }

  function finish_rename(row: Row, name: string | null): void {
    set_renaming(null);
    const target = name?.trim() ?? "";
    if (target && target !== row.name) void calls.rename(row.id, target);
  }

  function remove(row: Row): void {
    confirm_dialog({
      title: `Delete ${row.name}?`,
      message: describe_delete(row),
      confirm_label: "Delete",
      danger: true,
      run: async () => void (await calls.remove(row.id)),
    });
  }

  const columns: TableColumn<Row>[] = [
    {
      label: "Category",
      id: "name",
      cell: (row) =>
        renaming === row.id ? (
          <RenameField label={`Rename ${row.name}`} value={row.name} on_done={(name) => finish_rename(row, name)} />
        ) : (
          <>
            <button type="button" className="link" title={`Open ${row.name}`} onClick={() => set_open_id(row.id)}>
              {row.name}
            </button>
            {inside_count(row) > 0 && <span className="muted small"> ({inside_count(row)} inside)</span>}
          </>
        ),
    },
    ...count_columns,
    {
      label: "Actions",
      id: "actions",
      header: <span className="visually-hidden">Actions</span>,
      class: "actions-cell",
      width: 230,
      cell: (row) => (
        <div className="row-actions">
          <button type="button" aria-label={`Rename ${row.name}`} onClick={() => set_renaming(row.id)}>
            Rename
          </button>
          <button type="button" aria-label={`Move ${row.name}`} onClick={() => set_moving(row)}>
            Move
          </button>
          <button type="button" className="danger" aria-label={`Delete ${row.name}`} onClick={() => remove(row)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  const label = open ? `New category in ${open.name}` : "New category";
  return (
    <div className="stack tight">
      <Crumbs items={trail_to(open, categories, set_open_id)} />
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input type="text" aria-label={label} placeholder={`${label}…`} value={draft} onChange={(event) => set_draft(event.currentTarget.value)} />
        <button type="submit" className="accent solid" disabled={!draft.trim()}>
          Add category
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="muted">{open ? `Nothing inside ${open.name} yet.` : "No categories yet."}</p>
      ) : (
        <DataTable
          caption={open ? `Categories in ${open.name}` : "Categories"}
          columns={columns}
          rows={rows}
          row_key={(row) => row.id}
          on_row_drag_start={(row) => set_dragged(row)}
          on_row_drag_end={() => set_dragged(null)}
          allow_inside_drop
          can_drop_on_row={(row) => dragged !== null && !category_subtree(dragged.id, categories).has(row.id)}
          on_row_drop={(row, placement) => {
            if (!dragged) return;
            const move = move_for_drop(dragged, row, placement, categories);
            void calls.move(dragged.id, move.parent_id, move.position);
          }}
        />
      )}
      {moving && <MoveDialog category={moving} categories={categories} on_move={(parent_id) => void calls.move(moving.id, parent_id, null).then(() => set_moving(null))} on_close={() => set_moving(null)} />}
      {children}
    </div>
  );
}
