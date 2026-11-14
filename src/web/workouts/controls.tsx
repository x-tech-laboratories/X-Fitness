// The exercise picker the Workouts section shares, its exercises grouped by category.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Select, type OptionGroup } from "@x-tech-laboratories/x-libs/web/react/controls";

import { shown_separator, type PlacedCategory } from "../../shared/category_tree.ts";
import type { Exercise } from "../../shared/workouts/model.ts";

// ── Exercise picker ──────────────────────────────────────────────────────────

const uncategorised = "Uncategorised";

// One group per category headed by its path, an exercise under each of its own, the uncategorised last.
export function exercise_groups(exercises: Exercise[], categories: PlacedCategory[]): OptionGroup<string>[] {
  const sorted = [...exercises].sort((first, second) => first.name.localeCompare(second.name));
  const option = (exercise: Exercise): [string, string] => [exercise.id, exercise.name];
  return [
    ...categories.map((category) => ({ label: category.path.join(shown_separator), options: sorted.filter((exercise) => exercise.categories.includes(category.id)).map(option) })),
    { label: uncategorised, options: sorted.filter((exercise) => exercise.categories.length === 0).map(option) },
  ];
}

export function ExerciseSelect({ label, exercises, categories, value, placeholder, on_change }: { label: string; exercises: Exercise[]; categories: PlacedCategory[]; value: string; placeholder: string; on_change: (id: string) => void }) {
  const groups = useMemo(() => exercise_groups(exercises, categories), [exercises, categories]);
  return <Select label={label} bare options={[["", exercises.length ? placeholder : "No exercises yet"]]} groups={groups} value={value} on_change={on_change} />;
}
