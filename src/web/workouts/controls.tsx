// The exercise picker the Workouts section shares, its exercises grouped by category.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PlacedCategory } from "../../shared/category_tree.ts";
import type { Exercise } from "../../shared/workouts/model.ts";
import { CategorizedSelect } from "../categories.tsx";

// ── Exercise picker ──────────────────────────────────────────────────────────

export function ExerciseSelect({ label, exercises, categories, value, placeholder, on_change }: { label: string; exercises: Exercise[]; categories: PlacedCategory[]; value: string; placeholder: string; on_change: (id: string) => void }) {
  return <CategorizedSelect label={label} items={exercises} categories={categories} value={value} placeholder={placeholder} empty_label="No exercises yet" on_change={on_change} />;
}
