// Categories that nest by naming their parent, shared by the diet and the workouts: each item keeps the ids of its
// categories, a category's path is read up its parents, and a "/" path such as "Protein/Meat" finds or makes one.

// ── Imports ──────────────────────────────────────────────────────────────────

import { in_tree_order, path_names, subtree_ids } from "@x-tech-laboratories/x-libs/web/tree";

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  // Null at the top of the tree.
  parent_id: string | null;
  name: string;
  // Its place among its siblings.
  position: number;
}

export interface PlacedCategory extends Category {
  // The names from the top of the tree down to this one.
  path: string[];
}

// How a path is typed, such as "Protein/Meat", and how it is shown.
export const category_separator = "/";
export const shown_separator = " › ";

export const uncategorized = "(uncategorized)";

// ── Reading the tree ─────────────────────────────────────────────────────────

export function normalize_category_name(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// A typed path's names, without the blanks between doubled slashes.
export function split_category_path(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw.split(category_separator).map((name) => name.trim()).filter(Boolean);
}

export function normalize_category_path(raw: unknown): string {
  return split_category_path(raw).join(category_separator);
}

// Category ids or typed paths, each once, in the order given.
export function normalize_category_refs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((ref): ref is string => typeof ref === "string").map((ref) => ref.trim()).filter(Boolean))];
}

// Every category in tree order, siblings by position and then by name, each with its path.
export function placed_categories(categories: Category[]): PlacedCategory[] {
  const by_name = [...categories].sort((first, second) => first.name.localeCompare(second.name));
  return in_tree_order(by_name).map((category) => ({ ...category, path: path_names(category, categories, (item) => item.name) }));
}

// The names down to a category; an id naming none, such as a path still to be made, is read as a typed path.
export function category_path(id: string, categories: Category[]): string[] {
  const category = categories.find((item) => item.id === id);
  return category ? path_names(category, categories, (item) => item.name) : split_category_path(id);
}

export function category_path_text(id: string, categories: Category[]): string {
  return category_path(id, categories).join(shown_separator);
}

// The category and every one below it.
export function category_subtree(id: string, categories: Category[]): Set<string> {
  return subtree_ids(id, categories);
}

// Whether any of an item's categories is the one given or sits below it.
export function is_in_category(item_categories: string[], id: string, categories: Category[]): boolean {
  const subtree = category_subtree(id, categories);
  return item_categories.some((item_category) => subtree.has(item_category));
}

export function children_of_category(parent_id: string | null, categories: Category[]): Category[] {
  return placed_categories(categories).filter((category) => category.parent_id === parent_id);
}

// After every sibling under the parent.
export function next_category_position(parent_id: string | null, categories: Category[]): number {
  return Math.max(-1, ...categories.filter((category) => category.parent_id === parent_id).map((category) => category.position)) + 1;
}

export function sibling_named(name: string, parent_id: string | null, categories: Category[], except_id?: string): Category | undefined {
  const lower = name.toLocaleLowerCase();
  return categories.find((category) => category.parent_id === parent_id && category.id !== except_id && category.name.toLocaleLowerCase() === lower);
}

// ── Typed paths ──────────────────────────────────────────────────────────────

// The category a typed path names, matching names whatever their case, and the categories to add for the steps missing.
export function find_category_path(path: string, categories: Category[], make_id: () => string): { id: string; added: Category[] } | null {
  const names = split_category_path(path);
  const known = [...categories];
  const added: Category[] = [];
  let parent_id: string | null = null;
  for (const name of names) {
    let step = sibling_named(name, parent_id, known);
    if (!step) {
      step = { id: make_id(), parent_id, name, position: next_category_position(parent_id, known) };
      known.push(step);
      added.push(step);
    }
    parent_id = step.id;
  }
  return parent_id === null ? null : { id: parent_id, added };
}

// Each category id kept, and each typed path found or added, once each.
export function resolve_category_refs(refs: unknown, categories: Category[], make_id: () => string): { ids: string[]; added: Category[] } {
  const known = [...categories];
  const added: Category[] = [];
  const ids: string[] = [];
  for (const ref of normalize_category_refs(refs)) {
    let id = known.some((category) => category.id === ref) ? ref : null;
    if (id === null) {
      const found = find_category_path(ref, known, make_id);
      if (!found) continue;
      known.push(...found.added);
      added.push(...found.added);
      id = found.id;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids, added };
}

// Item lists name each category once, and only those that still exist.
export function known_category_ids(ids: string[], categories: Category[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) === index && categories.some((category) => category.id === id));
}

// Each id as a typed path, for files read elsewhere.
export function category_paths_of(ids: string[], categories: Category[]): string[] {
  return ids.map((id) => category_path(id, categories).join(category_separator));
}
