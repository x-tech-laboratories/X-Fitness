// The Diet section's own pieces: the food and recipe picker, a food's unit picker, the category editor and filter,
// the nutrient fields, and the grouping and sorting the Foods, Recipes and Grocery tabs share.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import type { RowGroup, Sorting } from "@x-tech-laboratories/x-libs/web/react/table";

import {
  category_depth,
  category_leaf,
  food_label,
  food_units,
  is_in_category,
  normalize_categories,
  nutrient_groups,
  nutrients,
  serving_unit,
  uncategorized,
  type Food,
  type NutrientInfo,
  type NutrientKey,
  type Nutrients,
} from "../../shared/diet/model.ts";
import { field_value, format_amount, shown_unit, to_shown_value, to_stored_value } from "./format.ts";

// ── Pickers ──────────────────────────────────────────────────────────────────

interface Pickable {
  id: string;
  name: string;
  brand?: string;
  categories: string[];
}

interface ItemSelectProps {
  label: string;
  items: Pickable[];
  categories: string[];
  value: string;
  placeholder: string;
  // Shown instead of the placeholder when nothing is left to pick.
  empty_label?: string;
  exclude?: Set<string>;
  on_change: (id: string) => void;
  id?: string;
}

// Foods or recipes under one heading per category, offered under each of theirs, the uncategorised last, brands in the names.
export function ItemSelect({ label, items, categories, value, placeholder, empty_label, exclude, on_change, id }: ItemSelectProps) {
  const groups = useMemo(() => {
    const available = items.filter((item) => !exclude?.has(item.id)).sort((first, second) => first.name.localeCompare(second.name));
    const option = (item: Pickable): [string, string] => [item.id, food_label(item)];
    const grouped = categories
      .map((category) => ({ label: category, options: available.filter((item) => item.categories.includes(category)).map(option) }))
      .filter((group) => group.options.length > 0);
    const loose = available.filter((item) => item.categories.length === 0);
    return loose.length ? [...grouped, { label: uncategorized, options: loose.map(option) }] : grouped;
  }, [items, categories, exclude]);
  return <Select id={id} label={label} bare options={[["", groups.length === 0 && empty_label ? empty_label : placeholder]]} groups={groups} value={value} on_change={on_change} />;
}

export function serving_label(food: Food): string {
  return `serving (${format_amount(food.serving_size)} ${food.serving_unit})`;
}

// The whole serving, the serving unit and each unit the food defines.
export function FoodUnitSelect({ label, food, value, on_change }: { label: string; food: Food | undefined; value: string; on_change: (unit: string) => void }) {
  if (!food) return <span className="muted">—</span>;
  const options = food_units(food).map((unit): [string, string] => [unit.unit, unit.unit === serving_unit ? serving_label(food) : unit.unit]);
  const known = options.some(([unit]) => unit === value);
  return <Select label={label} bare options={known ? options : [...options, [value, value]]} value={value} on_change={on_change} />;
}

// ── Categories ───────────────────────────────────────────────────────────────

// An indented leaf, so a flat list reads as the tree.
export function indented_category(name: string): string {
  return `${"   ".repeat(category_depth(name))}${category_leaf(name)}`;
}

export function with_draft(categories: string[], draft: string): string[] {
  return draft.trim() ? normalize_categories([...categories, draft]) : categories;
}

interface CategoryEditorProps {
  categories: string[];
  draft: string;
  suggestions: string[];
  on_change: (categories: string[]) => void;
  on_draft_change: (draft: string) => void;
}

// Chips for the categories carried and a field offering the rest, kept as the tree's paths; the draft lives with the form
// so Save keeps it too.
export function CategoryEditor({ categories, draft, suggestions, on_change, on_draft_change }: CategoryEditorProps) {
  return (
    <ChipField
      label="Categories"
      values={categories}
      suggestions={suggestions}
      draft={draft}
      on_draft={on_draft_change}
      on_change={(next) => on_change(normalize_categories(next))}
      placeholder="Add a category…"
      empty_text="No categories."
    />
  );
}

export function CategoryFilter({ categories, value, on_change }: { categories: string[]; value: string; on_change: (value: string) => void }) {
  return (
    <Select
      label="Filter by category"
      bare
      options={[["", "All categories"], ...categories.map((name): [string, string] => [name, indented_category(name)]), [uncategorized, uncategorized]]}
      value={value}
      on_change={on_change}
    />
  );
}

export function GroupToggle({ checked, on_change }: { checked: boolean; on_change: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => on_change(event.currentTarget.checked)} />
      Group by category
    </label>
  );
}

// ── Grouping ─────────────────────────────────────────────────────────────────

// One table row; an item in several categories gets one per group, each with its own key.
export interface ListRow<Item> {
  key: string;
  item: Item;
}

function group_label(name: string, depth: number, count: number): ReactNode {
  return (
    <span className="diet-group" style={{ "--depth": depth } as CSSProperties}>
      {category_leaf(name)} <span className="muted">({count})</span>
    </span>
  );
}

// A group per category in tree order holding the items carrying it exactly; a parent whose items are all nested still
// gets its heading, and the uncategorised come last.
export function category_groups<Item>(items: Item[], categories: string[], categories_of: (item: Item) => string[], id_of: (item: Item) => string): RowGroup<ListRow<Item>>[] {
  const groups = categories
    .filter((category) => items.some((item) => categories_of(item).some((tag) => is_in_category(tag, category))))
    .map((category) => {
      const members = items.filter((item) => categories_of(item).includes(category));
      return { key: category, label: group_label(category, category_depth(category), members.length), rows: members.map((item) => ({ key: `${category}\u0000${id_of(item)}`, item })) };
    });
  const loose = items.filter((item) => categories_of(item).length === 0);
  if (loose.length) groups.push({ key: uncategorized, label: group_label(uncategorized, 0, loose.length), rows: loose.map((item) => ({ key: `\u0000${id_of(item)}`, item })) });
  return groups;
}

interface CategoryView<Item> {
  filter: string;
  set_filter: (filter: string) => void;
  grouped: boolean;
  set_grouped: (grouped: boolean) => void;
  sorting: Sorting;
  set_sorting: (sorting: Sorting) => void;
  rows: ListRow<Item>[];
  groups: RowGroup<ListRow<Item>>[] | undefined;
}

// The filter, grouping and sorting of a list of categorised items; grouping is remembered in this browser, per list.
export function use_category_view<Item extends { id: string; categories: string[] }>(items: Item[], categories: string[], grouped_key: string): CategoryView<Item> {
  const [filter, set_filter] = useState("");
  const [grouped, set_grouped] = use_pref(grouped_key, false, (value): value is boolean => typeof value === "boolean");
  const [sorting, set_sorting] = useState<Sorting>({ key: "name", descending: false });

  const filtered = useMemo(() => {
    if (!filter) return items;
    if (filter === uncategorized) return items.filter((item) => item.categories.length === 0);
    return items.filter((item) => item.categories.some((tag) => is_in_category(tag, filter)));
  }, [items, filter]);

  const groups = useMemo(() => (grouped ? category_groups(filtered, categories, (item) => item.categories, (item) => item.id) : undefined), [grouped, filtered, categories]);
  const rows = useMemo(() => filtered.map((item) => ({ key: item.id, item })), [filtered]);
  return { filter, set_filter, grouped, set_grouped, sorting, set_sorting, rows, groups };
}

// ── Nutrients ────────────────────────────────────────────────────────────────

const steps: Record<NutrientInfo["shown"], number> = { energy: 10, g: 1, mg: 1, "µg": 1 };

interface NutrientFieldsProps {
  values: Nutrients;
  energy: EnergyUnit;
  on_change: (key: NutrientKey, stored: number) => void;
}

// Each group's fields under its heading, the first group's without one when bare_first.
function NutrientGroups({ infos, values, energy, on_change, bare_first = false }: NutrientFieldsProps & { infos: NutrientInfo[]; bare_first?: boolean }) {
  const groups = nutrient_groups.map((group) => ({ ...group, infos: infos.filter((info) => info.group === group.id) })).filter((group) => group.infos.length > 0);
  return (
    <div className="stack">
      {groups.map((group, index) => (
        <div key={group.id} className="stack tight">
          {!(bare_first && index === 0) && <h3>{group.label}</h3>}
          <div className="diet-nutrient-grid">
            {group.infos.map((info) => (
              <NumberField
                key={info.id}
                label={info.label}
                unit={shown_unit(info, energy)}
                min={0}
                step={steps[info.shown]}
                value={field_value(to_shown_value(info, values[info.key], energy))}
                on_change={(shown) => on_change(info.key, to_stored_value(info, shown ?? 0, energy))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// A field per nutrient Settings shows, in the units they are shown in, and the rest folded away until a food has some of
// them; on_change gets the value as stored.
export function NutrientFields({ shown, ...props }: NutrientFieldsProps & { shown: NutrientInfo[] }) {
  // Salt is only another view of sodium, so it stays out of the rest.
  const rest = nutrients.filter((info) => !shown.includes(info) && !info.scale);
  const [open, set_open] = useState(() => rest.some((info) => props.values[info.key] > 0));
  return (
    <div className="stack">
      <NutrientGroups {...props} infos={shown} bare_first />
      {rest.length > 0 && (
        <details open={open} onToggle={(event) => set_open(event.currentTarget.open)}>
          <summary>More nutrients</summary>
          <NutrientGroups {...props} infos={rest} />
        </details>
      )}
    </div>
  );
}
