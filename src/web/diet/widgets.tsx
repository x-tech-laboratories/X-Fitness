// The Diet section's own pieces: the food and recipe picker, a food's unit picker, the nutrient fields, and the category
// filter, grouping and sorting the Foods, Recipes and Grocery tabs share.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from "react";
import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { FormGroup, PathText } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import type { RowGroup, Sorting } from "@x-tech-laboratories/x-libs/web/react/table";

import { is_in_category, shown_separator, uncategorized, type PlacedCategory } from "../../shared/category_tree.ts";
import {
  food_label,
  food_units,
  nutrient_groups,
  nutrients,
  serving_unit,
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
  categories: PlacedCategory[];
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
      .map((category) => ({ label: category.path.join(shown_separator), options: available.filter((item) => item.categories.includes(category.id)).map(option) }))
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

interface CategoryView<Item> {
  filter: string;
  set_filter: (filter: string) => void;
  grouped: boolean;
  set_grouped: (grouped: boolean) => void;
  sorting: Sorting;
  set_sorting: (sorting: Sorting) => void;
  rows: ListRow<Item>[];
  groups: RowGroup<ListRow<Item>>[] | undefined;
  // How many of all the items sit in a category or below it, and how many have none, for the filter's chips.
  count_in: (id: string) => number;
  uncategorized_count: number;
}

// The filter, grouping and sorting of a list of categorised items; grouping is remembered in this browser, per list.
export function use_category_view<Item extends { id: string; categories: string[] }>(items: Item[], categories: PlacedCategory[], grouped_key: string): CategoryView<Item> {
  const [filter, set_filter] = useState("");
  const [grouped, set_grouped] = use_pref(grouped_key, false, (value): value is boolean => typeof value === "boolean");
  const [sorting, set_sorting] = useState<Sorting>({ key: "name", descending: false });

  const filtered = useMemo(() => {
    if (!filter) return items;
    if (filter === uncategorized) return items.filter((item) => item.categories.length === 0);
    return items.filter((item) => is_in_category(item.categories, filter, categories));
  }, [items, filter, categories]);

  const groups = useMemo(() => (grouped ? category_groups(filtered, categories, (item) => item.categories, (item) => item.id) : undefined), [grouped, filtered, categories]);
  const rows = useMemo(() => filtered.map((item) => ({ key: item.id, item })), [filtered]);
  const count_in = (id: string) => items.filter((item) => is_in_category(item.categories, id, categories)).length;
  const uncategorized_count = items.filter((item) => item.categories.length === 0).length;
  return { filter, set_filter, grouped, set_grouped, sorting, set_sorting, rows, groups, count_in, uncategorized_count };
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

  return (
    <div className="stack">
      <NutrientGroups {...props} infos={shown} bare_first />
      {rest.length > 0 && (
        <FormGroup summary="More nutrients" open={rest.some((info) => props.values[info.key] > 0)}>
          <NutrientGroups {...props} infos={rest} />
        </FormGroup>
      )}
    </div>
  );
}
