// The exercise library: every exercise with how it is measured, its equipment, muscles, categories and picture, found by
// name or category, shown as a table or a grid of pictures, and added by hand or from the wger database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ChipField, with_draft } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { Segmented, Select, SearchBox } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { MenuButton } from "@x-tech-laboratories/x-libs/web/react/menu_button";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { describe_error } from "@x-tech-laboratories/x-libs/web/errors";
import { shrink_picture } from "@x-tech-laboratories/x-libs/web/pictures";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { ComboField } from "@x-tech-laboratories/x-libs/web/react/suggestions";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { measurement_of, measurements, type Exercise, type Measurement } from "../../shared/workouts/model.ts";
import type { LibraryExercise, WorkoutLibrary } from "../../shared/workouts/store.ts";
import type { WgerResult } from "../../shared/workouts/wger.ts";
import { calls, succeeds, use_data } from "../api.ts";
import { CategoryBrowser, CategoryEditor, CategoryPaths, category_paths_text, use_category_filter } from "../categories.tsx";
import { DialogButtons } from "../forms.tsx";
import { open_item_history } from "../history/HistoryView.tsx";
import { LookupPanel } from "../lookup.tsx";
import { confirm_delete, row_actions_column } from "../rows.tsx";

// ── Form ─────────────────────────────────────────────────────────────────────

function blank_exercise(): Exercise {
  return { id: "", name: "", measurement: "weight", equipment: "", muscles: [], categories: [], notes: "" };
}

// The wger lookup above the form, a search form of its own: a hit only fills the form in, and nothing is saved until Save.
function WgerLookup({ on_pick }: { on_pick: (result: WgerResult) => void }) {
  return (
    <LookupPanel<WgerResult>
      label="Search the wger exercise database"
      results_label="wger results"
      search={async (term) => ({ results: await calls().search_wger_exercises(term) })}
      failure_text={(reason) => `wger could not be reached: ${reason}. You can still fill the form in by hand.`}
      empty_text="No matches."
      key_of={(result) => result.wger_id}
      row={(result, pick) => (
        <button type="button" className="result-row" onClick={pick}>
          <strong>{result.name}</strong>
          <span className="muted small">{[result.category, result.equipment].filter(Boolean).join(" · ") || "no equipment"}</span>
        </button>
      )}
      on_pick={on_pick}
      class_name="workouts-lookup"
    />
  );
}

// The picture beside a button to choose a file and one to remove it; a chosen file is shrunk before it is shown.
function PictureField({ picture, busy, on_change }: { picture: string; busy: boolean; on_change: (picture: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);

  async function take(file: File | undefined): Promise<void> {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    try {
      on_change(await shrink_picture(file));
    } catch (failure) {
      toast(`Could not use that picture: ${describe_error(failure)}`, { tone: "bad" });
    }
  }

  return (
    <div className="workouts-picture-field">
      {picture ? <img className="workouts-picture" src={picture} alt="The exercise's picture" /> : <span className="muted small">{busy ? "Fetching the picture…" : "No picture."}</span>}
      <span className="row-actions">
        <input ref={picker} type="file" accept="image/*" hidden aria-label="Picture file" onChange={(event) => void take(event.currentTarget.files?.[0])} />
        <button type="button" onClick={() => picker.current?.click()}>
          Choose Picture…
        </button>
        {picture && (
          <button type="button" onClick={() => on_change("")}>
            Remove
          </button>
        )}
      </span>
    </div>
  );
}

export function ExerciseDialog({ initial, library, on_close }: { initial: Exercise | null; library: WorkoutLibrary; on_close: () => void }) {
  const [exercise, set_exercise] = useState<Exercise>(() => initial ?? blank_exercise());
  const [muscle_draft, set_muscle_draft] = useState("");
  // The picture as changed here, or undefined while it is still the stored one.
  const [picture, set_picture] = useState<string | undefined>(undefined);
  const [fetching, set_fetching] = useState(false);
  const stored = use_data((api) => (initial ? api.get_exercise_picture(initial.id) : Promise.resolve("")), [initial?.id]);
  const change = (changes: Partial<Exercise>) => set_exercise((current) => ({ ...current, ...changes }));

  async function take_wger_picture(wger_id: number): Promise<void> {
    set_fetching(true);
    try {
      const full = await calls().lookup_wger_picture(wger_id);
      if (full) set_picture(await shrink_picture(full));
    } catch (failure) {
      toast(`Could not fetch wger's picture: ${describe_error(failure)}`, { tone: "bad" });
    } finally {
      set_fetching(false);
    }
  }

  function pick(result: WgerResult): void {
    if (result.has_picture) void take_wger_picture(result.wger_id);
    set_exercise((current) => ({
      ...current,
      name: result.name,
      measurement: result.measurement,
      equipment: result.equipment,
      muscles: result.muscles,
      categories: result.category && !current.categories.includes(result.category) ? [...current.categories, result.category] : current.categories,
    }));
  }

  async function save(): Promise<void> {
    if (!exercise.name.trim()) {
      toast("An exercise needs a name.", { tone: "bad" });
      return;
    }
    if (await succeeds(() => calls().save_exercise({ ...exercise, id: exercise.id || undefined, muscles: with_draft(exercise.muscles, muscle_draft), categories: exercise.categories, picture }))) on_close();
  }

  return (
    <Dialog
      title={initial ? `Edit ${initial.name}` : "Add Exercise"}
      wide
      on_close={on_close}
      buttons={<DialogButtons can_save={!fetching} on_save={() => void save()} on_cancel={on_close} />}
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
          <CategoryEditor categories={library.categories} values={exercise.categories} on_change={(categories) => change({ categories })} />
        </FormRow>
        <FormRow label="Picture" id="exercise-picture">
          <PictureField picture={picture ?? stored.data ?? ""} busy={fetching} on_change={set_picture} />
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

// ── Grid ─────────────────────────────────────────────────────────────────────

type Layout = "table" | "grid";

const layouts: { value: Layout; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "grid", label: "Grid" },
];

function is_layout(value: unknown): value is Layout {
  return layouts.some((layout) => layout.value === value);
}

const exercise_link = (id: string) => `#/workouts/exercises/${encodeURIComponent(id)}`;

interface ExerciseGridProps {
  exercises: LibraryExercise[];
  on_edit: (exercise: LibraryExercise) => void;
  on_remove: (exercise: LibraryExercise) => void;
}

// Each exercise as a tile with its picture; a tile opens its form in place, so the grid keeps its scroll.
function ExerciseGrid({ exercises, on_edit, on_remove }: ExerciseGridProps) {
  const pictures = use_data((api) => api.list_exercise_pictures());

  return (
    <div className="workouts-exercise-grid">
      <MediaGrid label="Exercises">
        {exercises.map((exercise) => (
          <MediaTile
            key={exercise.id}
            title={exercise.name}
            href={exercise_link(exercise.id)}
            on_open={() => on_edit(exercise)}
            image={pictures.data?.[exercise.id]}
            lines={[
              [measurement_of(exercise.measurement).label, exercise.equipment].filter(Boolean).join(" · "),
              exercise.muscles.join(", "),
              exercise.last_done && <span className="muted">{`Last done ${exercise.last_done}`}</span>,
            ]}
            actions={
              <MenuButton
                label={`Actions for ${exercise.name}`}
                items={[
                  { label: "Edit", run: () => on_edit(exercise) },
                  { label: "History", run: () => open_item_history("exercise", exercise.id, exercise.name) },
                  { label: "Delete", run: () => on_remove(exercise), danger: true, separator_before: true },
                ]}
              />
            }
          />
        ))}
      </MediaGrid>
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

// An exercise's id after the tab in the route, such as from a tile opened in a new tab, opens its form.
export function ExercisesTab({ library, open_id }: { library: WorkoutLibrary; open_id?: string }) {
  const [editing, set_editing] = useState<Exercise | "new" | null>(null);
  const [search, set_search] = useState("");
  const filter = use_category_filter(library.exercises, library.categories);
  const [layout, set_layout] = use_pref<Layout>("x-fitness-workouts-exercise-layout", "table", is_layout);
  const linked = library.exercises.find((exercise) => exercise.id === open_id);

  useEffect(() => {
    if (linked) set_editing(linked);
  }, [linked?.id]);

  function close(): void {
    set_editing(null);
    if (open_id) location.hash = "#/workouts/exercises";
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return filter.filtered.filter((exercise) => !needle || exercise.name.toLowerCase().includes(needle));
  }, [filter.filtered, search]);

  function remove(exercise: LibraryExercise): void {
    confirm_delete(`Delete ${exercise.name}?`, "Workouts already logged keep their sets, shown as a deleted exercise.", () => succeeds(() => calls().delete_exercise(exercise.id)));
  }

  const dash = (text: string) => text || "—";
  const columns: TableColumn<LibraryExercise>[] = [
    { label: "Name", cell: (exercise) => <span title={exercise.notes}>{exercise.name}</span>, sort: (exercise) => exercise.name.toLowerCase() },
    { label: "Measured as", cell: (exercise) => measurement_of(exercise.measurement).label },
    { label: "Equipment", cell: (exercise) => dash(exercise.equipment) },
    { label: "Muscles", cell: (exercise) => dash(exercise.muscles.join(", ")) },
    { label: "Categories", cell: (exercise) => (exercise.categories.length ? <CategoryPaths ids={exercise.categories} categories={library.categories} /> : "—"), sort: (exercise) => category_paths_text(exercise.categories, library.categories).toLowerCase() },
    { label: "Last done", cell: (exercise) => dash(exercise.last_done ?? ""), sort: (exercise) => exercise.last_done },
    row_actions_column<LibraryExercise>({
      name: (exercise) => exercise.name,
      edit: set_editing,
      history: (exercise) => ({ kind: "exercise", item_id: exercise.id }),
      remove,
    }),
  ];

  return (
    <>
      <Toolbar>
        <button type="button" className="accent solid" onClick={() => set_editing("new")}>
          Add Exercise
        </button>
        <SearchBox label="Search exercises" value={search} on_input={set_search} />
        <Segmented label="Show exercises as" choices={layouts} value={layout} on_change={set_layout} />
      </Toolbar>
      <CategoryBrowser categories={library.categories} view={filter} />
      {visible.length === 0 ? (
        <Empty title="No exercises." hint={library.exercises.length === 0 ? "Add one by hand or look it up in wger." : "Nothing matches the search."} />
      ) : layout === "grid" ? (
        <ExerciseGrid exercises={visible} on_edit={set_editing} on_remove={remove} />
      ) : (
        <DataTable columns={columns} rows={visible} row_key={(exercise) => exercise.id} />
      )}
      {editing && <ExerciseDialog key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} library={library} on_close={close} />}
    </>
  );
}
