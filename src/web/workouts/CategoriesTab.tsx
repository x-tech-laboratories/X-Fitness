// Categories, shared by exercises and sessions: opened like folders, added inside the one open, renamed, moved or nested
// by dragging, merged by landing beside one of the same name, and deleted with everything inside while the items stay.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import type { CategoryUsage } from "../../shared/workouts/store.ts";
import { attempt, calls, succeeds, use_data } from "../api.ts";
import { CategoryManager, count_column } from "../categories.tsx";

// ── Tab ──────────────────────────────────────────────────────────────────────

const count_columns = [
  count_column<CategoryUsage>("Exercises", "exercises", (category) => [category.exercises, category.exercises_in_tree]),
  count_column<CategoryUsage>("Sessions", "sessions", (category) => [category.sessions, category.sessions_in_tree]),
];

function describe_delete(category: CategoryUsage): string {
  const used = category.exercises_in_tree + category.sessions_in_tree > 0;
  return used
    ? `It is taken off ${category.exercises_in_tree} exercise(s) and ${category.sessions_in_tree} session(s), with everything inside it. The exercises and sessions are kept.`
    : "Everything inside it goes with it.";
}

export function CategoriesTab() {
  const categories = use_data((api) => api.list_workout_categories());
  return (
    <Loaded resource={categories}>
      {(list) => (
        <CategoryManager
          categories={list}
          count_columns={count_columns}
          describe_delete={describe_delete}
          calls={{
            add: (name, parent_id) => succeeds(() => calls().add_workout_category(name, parent_id)),
            rename: (id, name) => attempt(() => calls().rename_workout_category(id, name)),
            move: (id, parent_id, position) => attempt(() => calls().move_workout_category(id, parent_id, position)),
            remove: (id) => attempt(() => calls().delete_workout_category(id)),
          }}
        >
          <p className="muted small">Exercises and sessions share these. Open one to see what is inside it; drag rows to reorder them or onto one another to nest them.</p>
        </CategoryManager>
      )}
    </Loaded>
  );
}
