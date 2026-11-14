// Where the diet and the workouts keep their category trees: reading one, adding, renaming, moving, merging and deleting
// categories, and turning typed paths into categories made where missing.

// ── Imports ──────────────────────────────────────────────────────────────────

import { asc, eq } from "@x-tech-laboratories/x-libs/drizzle";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { category_subtree, children_of_category, next_category_position, normalize_category_name, placed_categories, resolve_category_refs, sibling_named, split_category_path, type Category } from "./category_tree.ts";
import type { diet_categories } from "./diet/schema.ts";
import { drizzle_of, new_id } from "./feature.ts";
import type { workout_categories } from "./workouts/schema.ts";

// ── Tables ───────────────────────────────────────────────────────────────────

export type CategoryTable = typeof diet_categories | typeof workout_categories;

// Rewrites the categories of every item whose list the rule changes.
export type Retag = (change: (ids: string[]) => string[]) => void;

export function read_categories(database: SqlDatabase, table: CategoryTable): Category[] {
  const rows = drizzle_of(database).select().from(table).orderBy(asc(table.position), asc(table.name)).all();
  return placed_categories(rows).map(({ path: _path, ...category }) => category);
}

function insert_category(database: SqlDatabase, table: CategoryTable, category: Category): void {
  drizzle_of(database).insert(table).values(category).run();
}

// Typed paths become categories, made where missing, so the ids returned all exist.
export function save_category_refs(database: SqlDatabase, table: CategoryTable, refs: unknown): string[] {
  const { ids, added } = resolve_category_refs(refs, read_categories(database, table), new_id);
  for (const category of added) insert_category(database, table, category);
  return ids;
}

// A name already used under the same parent gives that category back rather than a twin.
export function add_category(database: SqlDatabase, table: CategoryTable, raw_name: unknown, parent_id: string | null = null): string {
  const name = normalize_category_name(raw_name);
  if (!name) throw new Error("A category needs a name.");
  const categories = read_categories(database, table);
  if (parent_id !== null && !categories.some((category) => category.id === parent_id)) throw new Error("That parent category no longer exists.");
  const twin = sibling_named(name, parent_id, categories);
  if (twin) return twin.id;
  const id = new_id();
  insert_category(database, table, { id, parent_id, name, position: next_category_position(parent_id, categories) });
  return id;
}

// The source's items and subcategories join the target, subcategories with the same name merging in turn.
function merge_category(database: SqlDatabase, table: CategoryTable, source_id: string, target_id: string, retag: Retag): void {
  const db = drizzle_of(database);
  for (const child of children_of_category(source_id, read_categories(database, table))) {
    const categories = read_categories(database, table);
    const twin = sibling_named(child.name, target_id, categories);
    if (twin) merge_category(database, table, child.id, twin.id, retag);
    else db.update(table).set({ parent_id: target_id, position: next_category_position(target_id, categories) }).where(eq(table.id, child.id)).run();
  }
  retag((ids) => [...new Set(ids.map((id) => (id === source_id ? target_id : id)))]);
  db.delete(table).where(eq(table.id, source_id)).run();
}

// Taking the name of a sibling merges the two.
export function rename_category(database: SqlDatabase, table: CategoryTable, id: string, raw_name: unknown, retag: Retag): void {
  const name = normalize_category_name(raw_name);
  if (!name) throw new Error("A category needs a name.");
  const categories = read_categories(database, table);
  const category = categories.find((item) => item.id === id);
  if (!category || category.name === name) return;
  const twin = sibling_named(name, category.parent_id, categories, id);
  if (twin) merge_category(database, table, id, twin.id, retag);
  else drizzle_of(database).update(table).set({ name }).where(eq(table.id, id)).run();
}

// Moves a category with everything below it; landing beside a sibling of the same name merges the two.
export function move_category(database: SqlDatabase, table: CategoryTable, id: string, parent_id: string | null, position: number | null, retag: Retag): void {
  const categories = read_categories(database, table);
  const category = categories.find((item) => item.id === id);
  if (!category) return;
  if (parent_id !== null && !categories.some((item) => item.id === parent_id)) throw new Error("That parent category no longer exists.");
  if (parent_id !== null && category_subtree(id, categories).has(parent_id)) throw new Error("A category cannot move inside itself.");
  const twin = sibling_named(category.name, parent_id, categories, id);
  if (twin) return merge_category(database, table, id, twin.id, retag);
  const place = position ?? (parent_id === category.parent_id ? category.position : next_category_position(parent_id, categories));
  drizzle_of(database).update(table).set({ parent_id, position: place }).where(eq(table.id, id)).run();
}

// The category and everything below it leave every item; the items stay.
export function delete_category(database: SqlDatabase, table: CategoryTable, id: string, retag: Retag): void {
  const subtree = category_subtree(id, read_categories(database, table));
  retag((ids) => ids.filter((item) => !subtree.has(item)));
  for (const each of subtree) drizzle_of(database).delete(table).where(eq(table.id, each)).run();
}

// The categories of a document from elsewhere, as typed paths each made where missing.
export function import_category_paths(database: SqlDatabase, table: CategoryTable, paths: string[]): void {
  save_category_refs(database, table, paths.filter((path) => split_category_path(path).length > 0));
}
