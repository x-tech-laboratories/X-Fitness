// The category pieces the Diet and Workouts pages share: the category tree managed one folder at a time, a filter that
// steps into categories the same way with the grouping and sorting of a list, the pickers on a form, and paths shown
// with chevrons.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Chip, Chips } from "@x-tech-laboratories/x-libs/web/react/badges";
import { TreeChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { Select, TreeSelect } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Crumbs, PathText, type CrumbTarget } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type RowGroup, type Sorting, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { move_for_drop } from "@x-tech-laboratories/x-libs/web/tree";

import { category_path, category_path_text, category_subtree, children_of_category, is_in_category, shown_separator, uncategorized, type Category, type PlacedCategory } from "../shared/category_tree.ts";
import { AddNameForm, use_rename } from "./forms.tsx";
import { confirm_delete, row_actions_column } from "./rows.tsx";

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

interface Categorized {
  id: string;
  name: string;
  categories: string[];
}

const name_of = (item: Categorized) => item.name;

interface CategorizedSelectProps<Item extends Categorized> {
  label: string;
  items: Item[];
  categories: PlacedCategory[];
  value: string;
  placeholder: string;
  // Shown instead of the placeholder when nothing is left to pick.
  empty_label?: string;
  exclude?: Set<string>;
  // The option's text, the item's name unless set.
  label_of?: (item: Item) => string;
  on_change: (id: string) => void;
  id?: string;
}

// Items under one heading per category that holds any, offered under each of theirs, the uncategorised last.
export function CategorizedSelect<Item extends Categorized>({ label, items, categories, value, placeholder, empty_label, exclude, label_of = name_of, on_change, id }: CategorizedSelectProps<Item>) {
  const groups = useMemo(() => {
    const available = items.filter((item) => !exclude?.has(item.id)).sort((first, second) => first.name.localeCompare(second.name));
    const option = (item: Item): [string, string] => [item.id, label_of(item)];
    const grouped = categories
      .map((category) => ({ label: category.path.join(shown_separator), options: available.filter((item) => item.categories.includes(category.id)).map(option) }))
      .filter((group) => group.options.length > 0);
    const loose = available.filter((item) => item.categories.length === 0);
    return loose.length ? [...grouped, { label: uncategorized, options: loose.map(option) }] : grouped;
  }, [items, categories, exclude, label_of]);
  return <Select id={id} label={label} bare options={[["", groups.length === 0 && empty_label ? empty_label : placeholder]]} groups={groups} value={value} on_change={on_change} />;
}

// ── Filtering ────────────────────────────────────────────────────────────────

export interface CategoryFilter<Item> {
  // "" for everything, uncategorized for items without a category, or a category's id.
  filter: string;
  set_filter: (filter: string) => void;
  // The items the filter lets through.
  filtered: Item[];
  // How many of all the items sit in a category or below it, and how many have none, for the filter's chips.
  count_in: (id: string) => number;
  uncategorized_count: number;
}

// The category filter of a list of categorised items.
export function use_category_filter<Item extends { categories: string[] }>(items: Item[], categories: PlacedCategory[]): CategoryFilter<Item> {
  const [filter, set_filter] = useState("");
  const filtered = useMemo(() => {
    if (!filter) return items;
    if (filter === uncategorized) return items.filter((item) => item.categories.length === 0);
    return items.filter((item) => is_in_category(item.categories, filter, categories));
  }, [items, filter, categories]);
  const count_in = (id: string) => items.filter((item) => is_in_category(item.categories, id, categories)).length;
  const uncategorized_count = items.filter((item) => item.categories.length === 0).length;
  return { filter, set_filter, filtered, count_in, uncategorized_count };
}

// A filter opened like folders: the trail back up, and a chip for each category inside the one open.
export function CategoryBrowser({ categories, view }: { categories: PlacedCategory[]; view: CategoryFilter<unknown> }) {
  const { filter: value, set_filter: on_change, count_in, uncategorized_count } = view;
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

// ── Grouping ─────────────────────────────────────────────────────────────────

export function GroupToggle({ checked, on_change }: { checked: boolean; on_change: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => on_change(event.currentTarget.checked)} />
      Group by category
    </label>
  );
}

// One table row; an item in several categories gets one per group, each with its own key.
export interface ListRow<Item> {
  key: string;
  item: Item;
}

function group_label(path: string[], count: number): ReactNode {
  return (
    <>
      <PathText names={path} /> <span className="muted">({count})</span>
    </>
  );
}

// A group per category in tree order, headed by its whole path, holding the items carrying it exactly; a parent whose
// items are all nested still gets its heading, and the uncategorised come last.
export function category_groups<Item>(items: Item[], categories: PlacedCategory[], categories_of: (item: Item) => string[], id_of: (item: Item) => string): RowGroup<ListRow<Item>>[] {
  const groups = categories
    .filter((category) => items.some((item) => is_in_category(categories_of(item), category.id, categories)))
    .map((category) => {
      const members = items.filter((item) => categories_of(item).includes(category.id));
      return { key: category.id, label: group_label(category.path, members.length), rows: members.map((item) => ({ key: `${category.id}\u0000${id_of(item)}`, item })) };
    });
  const loose = items.filter((item) => categories_of(item).length === 0);
  if (loose.length) groups.push({ key: uncategorized, label: group_label([uncategorized], loose.length), rows: loose.map((item) => ({ key: `\u0000${id_of(item)}`, item })) });
  return groups;
}

interface CategoryView<Item> extends CategoryFilter<Item> {
  grouped: boolean;
  set_grouped: (grouped: boolean) => void;
  sorting: Sorting;
  set_sorting: (sorting: Sorting) => void;
  rows: ListRow<Item>[];
  groups: RowGroup<ListRow<Item>>[] | undefined;
}

// The filter, grouping and sorting of a table of categorised items; grouping is remembered in this browser, per list.
export function use_category_view<Item extends { id: string; categories: string[] }>(items: Item[], categories: PlacedCategory[], grouped_key: string): CategoryView<Item> {
  const filter = use_category_filter(items, categories);
  const [grouped, set_grouped] = use_pref(grouped_key, false, (value): value is boolean => typeof value === "boolean");
  const [sorting, set_sorting] = useState<Sorting>({ key: "name", descending: false });
  const { filtered } = filter;
  const groups = useMemo(() => (grouped ? category_groups(filtered, categories, (item) => item.categories, (item) => item.id) : undefined), [grouped, filtered, categories]);
  const rows = useMemo(() => filtered.map((item) => ({ key: item.id, item })), [filtered]);
  return { ...filter, grouped, set_grouped, sorting, set_sorting, rows, groups };
}

// ── Managing ─────────────────────────────────────────────────────────────────

// A category's count of items, with the count below it too beside it when that is more, such as "2 (5 with nested)".
export function NestedCount({ own, nested }: { own: number; nested: number }) {
  return (
    <>
      {own}
      {nested > own && <span className="muted small"> ({nested} with nested)</span>}
    </>
  );
}

// A count column of the category table, its own count and the one with everything nested below it.
export function count_column<Row>(label: string, id: string, counts: (row: Row) => [own: number, nested: number]): TableColumn<Row> {
  return {
    label,
    id,
    class: "number",
    cell: (row) => {
      const [own, nested] = counts(row);
      return <NestedCount own={own} nested={nested} />;
    },
  };
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
  const rename = use_rename<string>((id, name) => void calls.rename(id, name));
  const [moving, set_moving] = useState<Row | null>(null);
  const [dragged, set_dragged] = useState<Row | null>(null);

  const open = categories.find((category) => category.id === open_id) ?? null;
  const rows = categories.filter((category) => category.parent_id === (open?.id ?? null));
  const inside_count = (row: Row) => categories.filter((category) => category.parent_id === row.id).length;

  const columns: TableColumn<Row>[] = [
    {
      label: "Category",
      id: "name",
      cell: (row) =>
        rename.renaming === row.id ? (
          rename.field(row.id, row.name)
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
    row_actions_column<Row>({
      name: (row) => row.name,
      buttons: (row) => (
        <>
          <button type="button" aria-label={`Rename ${row.name}`} onClick={() => rename.start(row.id)}>
            Rename
          </button>
          <button type="button" aria-label={`Move ${row.name}`} onClick={() => set_moving(row)}>
            Move
          </button>
        </>
      ),
      remove: (row) => confirm_delete(`Delete ${row.name}?`, describe_delete(row), () => calls.remove(row.id)),
      width: 230,
    }),
  ];

  const label = open ? `New category in ${open.name}` : "New category";
  return (
    <div className="stack tight">
      <Crumbs items={trail_to(open, categories, set_open_id)} />
      <AddNameForm label={label} button="Add category" on_add={(name) => calls.add(name, open?.id ?? null).then((added) => added !== false)} />
      {rows.length === 0 ? (
        <Empty title={open ? `Nothing inside ${open.name} yet.` : "No categories yet."} />
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
