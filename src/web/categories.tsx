// The category pieces the Diet and Workouts pages share: the category tree managed in one folding table, a filter
// picked from the same tree in a dropdown with the grouping and sorting of a list, the pickers on a form, and paths shown
// with chevrons.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { TreeChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { Select, TreeSelect } from "@x-tech-laboratories/x-libs/web/react/controls";
import { PathText } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type RowGroup, type Sorting, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { move_for_drop } from "@x-tech-laboratories/x-libs/web/tree";

import { category_path, category_path_text, category_subtree, is_in_category, shown_separator, uncategorized, type Category, type PlacedCategory } from "../shared/category_tree.ts";
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

// A filter picked from the category tree in a dropdown, "All categories" its blank choice and the uncategorised last.
export function CategoryFilterSelect({ categories, view }: { categories: PlacedCategory[]; view: CategoryFilter<unknown> }) {
  const { filter, set_filter, uncategorized_count } = view;
  const items = useMemo(
    () => (uncategorized_count > 0 ? [...categories, { id: uncategorized, parent_id: null, name: uncategorized, position: Number.POSITIVE_INFINITY }] : categories),
    [categories, uncategorized_count],
  );
  return <TreeSelect label="Filter by category" items={items} name_of={(category) => category.name} value={filter} blank_label="All categories" on_change={set_filter} />;
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
  // Where this browser remembers which categories are folded.
  collapsed_key: string;
  // A word on renaming, dragging and deleting, under the table.
  children?: ReactNode;
}

function is_id_list(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// The whole category tree in one table, each category folding open on its row; rows drag beside each other to reorder
// or onto one another to nest, and Add inside puts a new one under a row.
export function CategoryManager<Row extends PlacedCategory>({ categories, count_columns, describe_delete, calls, collapsed_key, children }: CategoryManagerProps<Row>) {
  const rename = use_rename<string>((id, name) => void calls.rename(id, name));
  const [dragged, set_dragged] = useState<Row | null>(null);
  const [adding_to, set_adding_to] = useState<Row | null>(null);
  const [collapsed_ids, set_collapsed_ids] = use_pref(collapsed_key, [] as string[], is_id_list);

  const top = categories.filter((category) => category.parent_id === null);
  const children_of = (row: Row) => {
    const inside = categories.filter((category) => category.parent_id === row.id);
    return inside.length ? inside : undefined;
  };
  const parent_ids = [...new Set(categories.map((category) => category.parent_id).filter((id): id is string => id !== null))];
  const expanded = parent_ids.filter((id) => !collapsed_ids.includes(id));
  // Folds kept for categories that have nothing inside right now stay as they were.
  const change_expanded = (next: string[]) => set_collapsed_ids([...collapsed_ids.filter((id) => !parent_ids.includes(id)), ...parent_ids.filter((id) => !next.includes(id))]);

  const columns: TableColumn<Row>[] = [
    { label: "Category", id: "name", cell: (row) => (rename.renaming === row.id ? rename.field(row.id, row.name) : row.name) },
    ...count_columns,
    row_actions_column<Row>({
      name: (row) => row.name,
      buttons: (row) => (
        <>
          <button type="button" aria-label={`Add inside ${row.name}`} onClick={() => set_adding_to(row)}>
            Add inside
          </button>
          <button type="button" aria-label={`Rename ${row.name}`} onClick={() => rename.start(row.id)}>
            Rename
          </button>
        </>
      ),
      remove: (row) => confirm_delete(`Delete ${row.name}?`, describe_delete(row), () => calls.remove(row.id)),
      width: 270,
    }),
  ];

  function add_inside(parent: Row, name: string): Promise<boolean> {
    return calls.add(name, parent.id).then((added) => {
      if (added === false) return false;
      set_collapsed_ids(collapsed_ids.filter((id) => id !== parent.id));
      set_adding_to(null);
      return true;
    });
  }

  return (
    <div className="stack tight">
      <AddNameForm label="New category" button="Add category" on_add={(name) => calls.add(name, null).then((added) => added !== false)} />
      {top.length === 0 ? (
        <Empty title="No categories yet." />
      ) : (
        <DataTable
          caption="Categories"
          columns={columns}
          rows={top}
          row_key={(row) => row.id}
          get_children={children_of}
          expanded={expanded}
          on_expanded_change={change_expanded}
          render_after_row={(row) =>
            adding_to?.id === row.id ? <AddNameForm label={`New category in ${row.name}`} button="Add category" on_add={(name) => add_inside(row, name)} /> : null
          }
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
      {children}
    </div>
  );
}
