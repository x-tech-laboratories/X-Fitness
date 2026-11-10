// The exercise library: every exercise with how it is measured, its equipment, muscles and categories, found by name or
// category, and added by hand or from the wger database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ChipField, with_draft } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { Select, SearchBox } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { ComboField } from "@x-tech-laboratories/x-libs/web/react/suggestions";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { category_depth, category_leaf, is_in_category, measurement_of, measurements, normalize_categories, type Exercise, type Measurement } from "../../shared/workouts/model.ts";
import type { LibraryExercise, WorkoutLibrary } from "../../shared/workouts/store.ts";
import type { WgerResult } from "../../shared/workouts/wger.ts";
import { calls } from "../api.ts";
import { HistoryButton } from "../history/HistoryView.tsx";

// ── Form ─────────────────────────────────────────────────────────────────────

function blank_exercise(): Exercise {
  return { id: "", name: "", measurement: "weight", equipment: "", muscles: [], categories: [], notes: "" };
}

// The wger lookup above the form, a search form of its own: a hit only fills the form in, and nothing is saved until Save.
function WgerLookup({ on_pick }: { on_pick: (result: WgerResult) => void }) {
  const [results, set_results] = useState<WgerResult[] | null>(null);
  const [searching, set_searching] = useState(false);
  const [error, set_error] = useState("");

  async function search(term: string): Promise<void> {
    if (!term.trim()) return set_results(null);
    set_searching(true);
    set_error("");
    try {
      set_results(await calls().search_wger_exercises(term));
    } catch (failure) {
      set_results([]);
      set_error(failure instanceof Error ? failure.message : String(failure));
    } finally {
      set_searching(false);
    }
  }

  return (
    <div className="workouts-lookup">
      <SearchBox label="Search the wger exercise database" value="" submit_label={searching ? "Searching…" : "Search"} on_submit={(term) => void search(term)} />
      {error && <p className="tone-bad small">{`wger could not be reached: ${error}. You can still fill the form in by hand.`}</p>}
      {results && results.length === 0 && !searching && !error && <p className="muted small">No matches.</p>}
      {results && results.length > 0 && (
        <ul className="plain-list workouts-results" aria-label="wger results">
          {results.map((result) => (
            <li key={result.wger_id}>
              <button
                type="button"
                className="workouts-result"
                onClick={() => {
                  on_pick(result);
                  set_results(null);
                }}
              >
                <strong>{result.name}</strong>
                <span className="muted small">{[result.category, result.equipment].filter(Boolean).join(" · ") || "no equipment"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExerciseDialog({ initial, library, on_close }: { initial: Exercise | null; library: WorkoutLibrary; on_close: () => void }) {
  const [exercise, set_exercise] = useState<Exercise>(() => initial ?? blank_exercise());
  const [muscle_draft, set_muscle_draft] = useState("");
  const [category_draft, set_category_draft] = useState("");
  const change = (changes: Partial<Exercise>) => set_exercise((current) => ({ ...current, ...changes }));

  function pick(result: WgerResult): void {
    set_exercise((current) => ({
      ...current,
      name: result.name,
      measurement: result.measurement,
      equipment: result.equipment,
      muscles: result.muscles,
      categories: result.category ? normalize_categories([...current.categories, result.category]) : current.categories,
    }));
  }

  async function save(): Promise<void> {
    if (!exercise.name.trim()) {
      toast("An exercise needs a name.", { tone: "bad" });
      return;
    }
    await calls().save_exercise({ ...exercise, id: exercise.id || undefined, muscles: with_draft(exercise.muscles, muscle_draft), categories: with_draft(exercise.categories, category_draft) });
    on_close();
  }

  return (
    <Dialog
      title={initial ? `Edit ${initial.name}` : "Add Exercise"}
      wide
      on_close={on_close}
      buttons={
        <>
          <button type="button" onClick={on_close}>
            Cancel
          </button>
          <button type="button" className="accent solid" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <WgerLookup on_pick={pick} />
      <div className="form-rows">
        <FormRow label="Name" id="exercise-name">
          <input id="exercise-name" type="text" value={exercise.name} onChange={(event) => change({ name: event.currentTarget.value })} />
        </FormRow>
        <FormRow label="Measured as" id="exercise-measurement">
          <Select<Measurement> label="Measured as" bare options={measurements.map((item) => [item.key, item.label])} value={exercise.measurement} on_change={(measurement) => change({ measurement })} />
        </FormRow>
        <FormRow label="Equipment" id="exercise-equipment">
          <ComboField id="exercise-equipment" label="Equipment" placeholder="Barbell, dumbbell, none…" value={exercise.equipment} options={library.equipment} on_change={(equipment) => change({ equipment })} />
        </FormRow>
        <FormRow label="Muscles" id="exercise-muscles">
          <ChipField id="exercise-muscles" label="Muscles" placeholder="Add a muscle…" values={exercise.muscles} draft={muscle_draft} suggestions={library.muscles} on_change={(muscles) => change({ muscles })} on_draft={set_muscle_draft} />
        </FormRow>
        <FormRow label="Categories" id="exercise-categories">
          <ChipField
            id="exercise-categories"
            label="Categories"
            placeholder="Add a category…"
            values={exercise.categories}
            draft={category_draft}
            suggestions={library.categories}
            on_change={(categories) => change({ categories })}
            on_draft={set_category_draft}
          />
        </FormRow>
        <FormRow label="Notes" id="exercise-notes">
          <textarea id="exercise-notes" rows={2} value={exercise.notes} onChange={(event) => change({ notes: event.currentTarget.value })} />
        </FormRow>
      </div>
      <p className="muted small">
        Exercise data from <a href="https://wger.de" target="_blank" rel="noreferrer">wger</a>, licensed CC-BY-SA 4.0.
      </p>
    </Dialog>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function ExercisesTab({ library }: { library: WorkoutLibrary }) {
  const [editing, set_editing] = useState<Exercise | "new" | null>(null);
  const [search, set_search] = useState("");
  const [category, set_category] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return library.exercises
      .filter((exercise) => !category || exercise.categories.some((tag) => is_in_category(tag, category)))
      .filter((exercise) => !needle || exercise.name.toLowerCase().includes(needle));
  }, [library.exercises, search, category]);

  function remove(exercise: LibraryExercise): void {
    confirm_dialog({
      title: `Delete ${exercise.name}?`,
      message: "Workouts already logged keep their sets, shown as a deleted exercise.",
      confirm_label: "Delete",
      danger: true,
      run: () => calls().delete_exercise(exercise.id),
    });
  }

  const dash = (text: string) => text || "—";
  const columns: TableColumn<LibraryExercise>[] = [
    { label: "Name", cell: (exercise) => <span title={exercise.notes}>{exercise.name}</span>, sort: (exercise) => exercise.name.toLowerCase() },
    { label: "Measured as", cell: (exercise) => measurement_of(exercise.measurement).label },
    { label: "Equipment", cell: (exercise) => dash(exercise.equipment) },
    { label: "Muscles", cell: (exercise) => dash(exercise.muscles.join(", ")) },
    { label: "Categories", cell: (exercise) => dash(exercise.categories.join(", ")) },
    { label: "Last done", cell: (exercise) => dash(exercise.last_done ?? ""), sort: (exercise) => exercise.last_done },
    {
      label: "",
      id: "actions",
      class: "actions-cell",
      cell: (exercise) => (
        <span className="row-actions">
          <button type="button" onClick={() => set_editing(exercise)} aria-label={`Edit ${exercise.name}`}>
            Edit
          </button>
          <HistoryButton kind="exercise" item_id={exercise.id} name={exercise.name} />
          <button type="button" className="danger" onClick={() => remove(exercise)} aria-label={`Delete ${exercise.name}`}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <button type="button" className="accent solid" onClick={() => set_editing("new")}>
          Add Exercise
        </button>
        <SearchBox label="Search exercises" value={search} on_input={set_search} />
        <Select
          label="Category"
          bare
          options={[["", "All categories"], ...library.categories.map((name): [string, string] => [name, `${" ".repeat(category_depth(name) * 4)}${category_leaf(name)}`])]}
          value={category}
          on_change={set_category}
        />
      </Toolbar>
      {visible.length === 0 ? <Empty title="No exercises." hint={library.exercises.length === 0 ? "Add one by hand or look it up in wger." : "Nothing matches the search."} /> : <DataTable columns={columns} rows={visible} row_key={(exercise) => exercise.id} />}
      {editing && <ExerciseDialog initial={editing === "new" ? null : editing} library={library} on_close={() => set_editing(null)} />}
    </>
  );
}
