// Controls the Workouts section shares: a select whose options sit in groups, the exercise picker grouped by category,
// a text field that suggests values already in use, and a list of chips with such a field to add more.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useId, useMemo } from "react";
import { Chip, Chips } from "@x-tech-laboratories/x-libs/web/react/badges";
import { Suggestions } from "@x-tech-laboratories/x-libs/web/react/suggestions";

import type { Exercise } from "../../shared/workouts/model.ts";

// ── Grouped select ───────────────────────────────────────────────────────────

export interface OptionGroup {
  label: string;
  options: [value: string, text: string][];
}

interface GroupedSelectProps {
  label: string;
  groups: OptionGroup[];
  value: string;
  // The first, empty choice, such as "Pick an exercise…".
  placeholder: string;
  // Shown instead of the placeholder when there is nothing to pick.
  empty_label?: string;
  on_change: (value: string) => void;
}

// A select whose options sit under headings, an option appearing under each heading it belongs to.
export function GroupedSelect({ label, groups, value, placeholder, empty_label, on_change }: GroupedSelectProps) {
  const has_options = groups.some((group) => group.options.length > 0);
  return (
    <select aria-label={label} value={value} onChange={(event) => on_change(event.currentTarget.value)}>
      <option value="">{has_options || !empty_label ? placeholder : empty_label}</option>
      {groups
        .filter((group) => group.options.length > 0)
        .map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map(([option, text]) => (
              <option key={option} value={option}>
                {text}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

// ── Exercise picker ──────────────────────────────────────────────────────────

const uncategorised = "Uncategorised";

// One group per category, an exercise under each of its own, the uncategorised last.
export function exercise_groups(exercises: Exercise[], categories: string[]): OptionGroup[] {
  const sorted = [...exercises].sort((first, second) => first.name.localeCompare(second.name));
  const option = (exercise: Exercise): [string, string] => [exercise.id, exercise.name];
  return [
    ...categories.map((category) => ({ label: category, options: sorted.filter((exercise) => exercise.categories.includes(category)).map(option) })),
    { label: uncategorised, options: sorted.filter((exercise) => exercise.categories.length === 0).map(option) },
  ];
}

export function ExerciseSelect({ label, exercises, categories, value, placeholder, on_change }: { label: string; exercises: Exercise[]; categories: string[]; value: string; placeholder: string; on_change: (id: string) => void }) {
  const groups = useMemo(() => exercise_groups(exercises, categories), [exercises, categories]);
  return <GroupedSelect label={label} groups={groups} value={value} placeholder={placeholder} empty_label="No exercises yet" on_change={on_change} />;
}

// ── Suggesting field ─────────────────────────────────────────────────────────

interface SuggestFieldProps {
  label: string;
  value: string;
  suggestions: string[];
  placeholder?: string;
  id?: string;
  on_change: (value: string) => void;
  // Enter with no suggestion chosen, such as adding what was typed.
  on_commit?: () => void;
  on_take?: (value: string) => void;
}

// Free text with the values already in use offered under it as it is typed; anything else can still be typed.
export function SuggestField({ label, value, suggestions, placeholder, id, on_change, on_commit, on_take }: SuggestFieldProps) {
  const source = (text: string) => {
    const needle = text.trim().toLowerCase();
    return needle ? suggestions.filter((item) => item.toLowerCase().includes(needle) && item !== text).slice(0, 12) : [];
  };
  return (
    <Suggestions<string, HTMLInputElement>
      value={value}
      source={source}
      key_of={(item) => item}
      render={(item) => item}
      on_take={(item) => (on_take ?? on_change)(item)}
      label={`${label} suggestions`}
      on_key_down={(event) => {
        if (event.key === "Enter" && on_commit) {
          event.preventDefault();
          on_commit();
        }
      }}
    >
      {(field) => <input {...field} id={id} type="text" aria-label={label} placeholder={placeholder} value={value} onChange={(event) => on_change(event.currentTarget.value)} />}
    </Suggestions>
  );
}

// ── Chip list ────────────────────────────────────────────────────────────────

interface ChipFieldProps {
  label: string;
  values: string[];
  // What is being typed, kept by the form so saving can take a value still in the field.
  draft: string;
  suggestions: string[];
  placeholder: string;
  on_change: (values: string[]) => void;
  on_draft: (draft: string) => void;
}

// Chips for the values chosen, each removable, and a field that suggests more.
export function ChipField({ label, values, draft, suggestions, placeholder, on_change, on_draft }: ChipFieldProps) {
  const id = useId();
  const unused = useMemo(() => suggestions.filter((item) => !values.includes(item)), [suggestions, values]);
  const add = (value: string) => {
    const text = value.trim();
    if (text && !values.includes(text)) on_change([...values, text]);
    on_draft("");
  };
  return (
    <div className="form-row">
      <label htmlFor={id}>{label}</label>
      <div className="workouts-chip-field">
        <Chips>
          {values.length === 0 && <span className="muted small">None.</span>}
          {values.map((value) => (
            <Chip key={value} on_remove={() => on_change(values.filter((item) => item !== value))} remove_label={`Remove ${value}`}>
              {value}
            </Chip>
          ))}
        </Chips>
        <div className="workouts-inline">
          <SuggestField id={id} label={label} value={draft} suggestions={unused} placeholder={placeholder} on_change={on_draft} on_take={add} on_commit={() => add(draft)} />
          <button type="button" disabled={!draft.trim()} onClick={() => add(draft)}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// Values with any draft still in the field taken in, for saving.
export function with_draft(values: string[], draft: string): string[] {
  return draft.trim() ? [...values, draft.trim()] : values;
}
