// Programs, the plans: each a named block of sessions in the order it runs, each session the exercises of one day with
// their sets, targets, rest and progression, any of which starts today's workout.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useState } from "react";
import { format_local } from "@x-tech-laboratories/x-libs/dates";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Card, Cards, FormRow, RowActions, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import {
  is_progressable,
  measurement_of,
  normalize_progression,
  progression_defaults,
  progression_fields,
  progressions,
  type Exercise,
  type Program,
  type Progression,
  type ProgressionType,
  type Session,
  type SessionEntry,
} from "../../shared/workouts/model.ts";
import type { WorkoutLibrary } from "../../shared/workouts/store.ts";
import { calls } from "../api.ts";
import { ChipField, ExerciseSelect, with_draft } from "./controls.tsx";
import { field_labels, field_to_shown, field_to_stored, field_unit, format_field, format_number, type ShownUnits } from "./units.ts";

// ── Progression ──────────────────────────────────────────────────────────────

// A weight step's number as shown: a percentage as it is, an amount in the weight unit shown.
function ProgressionEditor({ progression, exercise, units, on_change }: { progression: Progression; exercise: Exercise | undefined; units: ShownUnits; on_change: (progression: Progression) => void }) {
  if (!exercise) return null;
  if (!is_progressable(exercise)) return <p className="muted small">Progression: Weight &amp; Reps only.</p>;

  // Defaults fill only what is still 0, so picking a type again never overwrites what was typed.
  function pick_type(type: ProgressionType): void {
    const seeded = Object.fromEntries(
      Object.entries(progression_defaults[type])
        .filter(([key]) => !progression[key as keyof Progression])
        .map(([key, value]) => [key, key === "increment" ? field_to_stored("weight", value as number, units) : value]),
    );
    on_change(normalize_progression({ ...progression, ...seeded, type }));
  }

  const fields = progressions.find((item) => item.key === progression.type)?.fields ?? [];
  return (
    <div className="workouts-progression">
      <Select<ProgressionType> label="Progression" options={progressions.map((item) => [item.key, item.label])} value={progression.type} on_change={pick_type} />
      {fields.map((key) => {
        const field = progression_fields[key];
        const percent_key = field.percent_key;
        const is_percent = percent_key ? progression[percent_key] : false;
        const is_weight = Boolean(percent_key) && !is_percent;
        const shown = is_weight ? field_to_shown("weight", progression[key], units) : progression[key];
        return (
          <div key={key} className="workouts-inline">
            <NumberField
              label={field.label}
              value={shown}
              min={0}
              step={field.step}
              on_change={(value) => on_change(normalize_progression({ ...progression, [key]: is_weight ? field_to_stored("weight", value ?? 0, units) : (value ?? 0) }))}
            />
            {percent_key && (
              <Select<string>
                label={`${field.label} in`}
                bare
                options={[
                  ["absolute", units.mass],
                  ["percent", "%"],
                ]}
                value={is_percent ? "percent" : "absolute"}
                on_change={(choice) => on_change(normalize_progression({ ...progression, [percent_key]: choice === "percent" }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Session form ─────────────────────────────────────────────────────────────

// Its id made here as the store makes one, since feature.ts would bring X-Libs drizzle into the page.
function blank_entry(rest: number): SessionEntry {
  return { id: crypto.randomUUID(), exercise_id: "", sets: 3, reps: 0, weight: 0, duration: 0, distance: 0, rest, notes: "", progression: normalize_progression(undefined) };
}

interface SessionDialogProps {
  program: Program;
  initial: Session | null;
  library: WorkoutLibrary;
  units: ShownUnits;
  default_rest: number;
  on_close: () => void;
}

export function SessionDialog({ program, initial, library, units, default_rest, on_close }: SessionDialogProps) {
  const [session, set_session] = useState<Session>(() => initial ?? { id: "", program_id: program.id, name: "", notes: "", categories: [], entries: [] });
  const [category_draft, set_category_draft] = useState("");
  const exercises = new Map(library.exercises.map((exercise) => [exercise.id, exercise]));
  const change_entry = (id: string, changes: Partial<SessionEntry>) => set_session((current) => ({ ...current, entries: current.entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) }));

  function move(from: number, to: number): void {
    set_session((current) => {
      const entries = [...current.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved!);
      return { ...current, entries };
    });
  }

  async function save(): Promise<void> {
    if (!session.name.trim()) {
      toast("A session needs a name.", { tone: "bad" });
      return;
    }
    await calls().save_program_session(program.id, { ...session, id: session.id || undefined, categories: with_draft(session.categories, category_draft) });
    on_close();
  }

  return (
    <Dialog
      title={initial ? `Edit ${initial.name}` : "Add Session"}
      subtitle={program.name}
      full
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
      <div className="form-rows">
        <FormRow label="Name" id="session-name">
          <input id="session-name" type="text" value={session.name} onChange={(event) => set_session({ ...session, name: event.currentTarget.value })} />
        </FormRow>
        <ChipField
          label="Categories"
          placeholder="Add a category…"
          values={session.categories}
          draft={category_draft}
          suggestions={library.categories}
          on_change={(categories) => set_session({ ...session, categories })}
          on_draft={set_category_draft}
        />
        <FormRow label="Notes" id="session-notes">
          <textarea id="session-notes" rows={2} value={session.notes} onChange={(event) => set_session({ ...session, notes: event.currentTarget.value })} />
        </FormRow>
      </div>

      <h3>Exercises</h3>
      {session.entries.length === 0 && <p className="muted">No exercises in this session yet.</p>}
      <Stack tight>
        {session.entries.map((entry, index) => {
          const exercise = exercises.get(entry.exercise_id);
          const label = exercise?.name ?? `Exercise ${index + 1}`;
          return (
            <fieldset key={entry.id} className="card workouts-entry-form" aria-label={label}>
              <div className="workouts-spread">
                <ExerciseSelect label={`Exercise ${index + 1}`} exercises={library.exercises} categories={library.categories} value={entry.exercise_id} placeholder="Pick an exercise…" on_change={(exercise_id) => change_entry(entry.id, { exercise_id })} />
                <RowActions index={index} count={session.entries.length} on_move={move} on_remove={() => set_session({ ...session, entries: session.entries.filter((item) => item.id !== entry.id) })} remove_label={`Remove ${label}`} />
              </div>
              <div className="workouts-fields">
                <NumberField label="Sets" value={entry.sets} min={1} on_change={(sets) => change_entry(entry.id, { sets: sets ?? 1 })} />
                {exercise &&
                  measurement_of(exercise.measurement).fields.map((field) => (
                    <NumberField
                      key={field}
                      label={`Target ${field_labels[field].toLowerCase()}`}
                      unit={field_unit(field, units)}
                      value={field_to_shown(field, entry[field], units)}
                      min={0}
                      step={field === "reps" ? 1 : 0.5}
                      on_change={(value) => change_entry(entry.id, { [field]: field_to_stored(field, value ?? 0, units) })}
                    />
                  ))}
                <NumberField label="Rest" unit="s" value={entry.rest} min={0} step={15} on_change={(rest) => change_entry(entry.id, { rest: rest ?? 0 })} />
              </div>
              <input type="text" aria-label={`Notes for ${label}`} placeholder="Notes…" value={entry.notes} onChange={(event) => change_entry(entry.id, { notes: event.currentTarget.value })} />
              <ProgressionEditor progression={entry.progression} exercise={exercise} units={units} on_change={(progression) => change_entry(entry.id, { progression })} />
            </fieldset>
          );
        })}
      </Stack>
      <p>
        <button type="button" onClick={() => set_session({ ...session, entries: [...session.entries, blank_entry(default_rest)] })}>
          Add Exercise
        </button>
      </p>
    </Dialog>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

// One line of a plan, such as "3 × Bench Press — 5 reps × 60 kg · 2:00 rest".
function plan_line(entry: SessionEntry, exercise: Exercise, units: ShownUnits): string {
  const targets = measurement_of(exercise.measurement)
    .fields.filter((field) => entry[field] > 0)
    .map((field) => format_field(field, entry[field], units))
    .join(" × ");
  return [`${format_number(entry.sets)} × ${exercise.name}${targets ? ` — ${targets}` : ""}`, entry.rest > 0 ? `${format_number(entry.rest)}s rest` : "", entry.notes].filter(Boolean).join(" · ");
}

interface ProgramsTabProps {
  library: WorkoutLibrary;
  units: ShownUnits;
  default_rest: number;
}

export function ProgramsTab({ library, units, default_rest }: ProgramsTabProps) {
  const [draft, set_draft] = useState("");
  const [editing, set_editing] = useState<{ program: Program; session: Session | null } | null>(null);
  const [renaming, set_renaming] = useState<{ program: Program; name: string } | null>(null);
  const exercises = new Map(library.exercises.map((exercise) => [exercise.id, exercise]));

  async function add_program(): Promise<void> {
    if (!draft.trim()) return;
    await calls().save_program({ name: draft });
    set_draft("");
  }

  async function start(session: Session): Promise<void> {
    await calls().start_workout(format_local(new Date(), false), session.id, new Date().toISOString());
    location.hash = "#/workouts/log";
  }

  function delete_program(program: Program): void {
    const count = program.sessions.length;
    confirm_dialog({
      title: `Delete ${program.name}?`,
      message: `${count > 0 ? `Its ${count} session(s) go with it. ` : ""}Workouts already logged are kept.`,
      confirm_label: "Delete",
      danger: true,
      run: () => calls().delete_program(program.id),
    });
  }

  function delete_session(session: Session): void {
    confirm_dialog({
      title: `Delete ${session.name}?`,
      message: "Workouts logged from it are kept.",
      confirm_label: "Delete",
      danger: true,
      run: () => calls().delete_program_session(session.id),
    });
  }

  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void add_program();
        }}
      >
        <input type="text" aria-label="New program" placeholder="New program…" value={draft} onChange={(event) => set_draft(event.currentTarget.value)} />
        <button type="submit" className="accent solid" disabled={!draft.trim()}>
          Add Program
        </button>
      </form>
      {library.programs.length === 0 && <Empty title="No programs yet." hint="A program groups the sessions of a training block, such as Push, Pull and Legs." />}
      <Stack>
        {library.programs.map((program) => (
          <Section
            key={program.id}
            title={program.name}
            tools={
              <>
                <span className="muted small">{`${program.sessions.length} session(s)`}</span>
                <button type="button" onClick={() => set_editing({ program, session: null })}>
                  Add Session
                </button>
                <button type="button" onClick={() => set_renaming({ program, name: program.name })} aria-label={`Rename ${program.name}`}>
                  Rename
                </button>
                <button type="button" className="danger" onClick={() => delete_program(program)} aria-label={`Delete ${program.name}`}>
                  Delete
                </button>
              </>
            }
          >
            {program.notes && <p className="muted">{program.notes}</p>}
            {program.sessions.length === 0 && <p className="muted">No sessions in this program yet.</p>}
            <Cards>
              {program.sessions.map((session, index) => (
                <Card key={session.id} title={session.name} subtitle={[`${session.entries.length} exercise(s)`, ...session.categories].join(" · ")}>
                  {session.notes && <p className="muted small">{session.notes}</p>}
                  <ul className="workouts-plan">
                    {session.entries.map((entry) => {
                      const exercise = exercises.get(entry.exercise_id);
                      return exercise ? <li key={entry.id}>{plan_line(entry, exercise, units)}</li> : <Fragment key={entry.id} />;
                    })}
                  </ul>
                  <div className="workouts-spread">
                    <span className="workouts-inline">
                      <button type="button" className="accent solid" onClick={() => void start(session)} aria-label={`Start ${session.name} today`}>
                        Start Today
                      </button>
                      <button type="button" onClick={() => set_editing({ program, session })} aria-label={`Edit ${session.name}`}>
                        Edit
                      </button>
                    </span>
                    <RowActions
                      index={index}
                      count={program.sessions.length}
                      on_move={(from, to) => void calls().move_program_session(session.id, to > from ? 1 : -1)}
                      on_remove={() => delete_session(session)}
                      remove_label={`Delete ${session.name}`}
                    />
                  </div>
                </Card>
              ))}
            </Cards>
          </Section>
        ))}
      </Stack>
      {editing && <SessionDialog program={editing.program} initial={editing.session} library={library} units={units} default_rest={default_rest} on_close={() => set_editing(null)} />}
      {renaming && (
        <Dialog
          title={`Rename ${renaming.program.name}`}
          on_close={() => set_renaming(null)}
          form={{
            on_submit: () => {
              void calls()
                .save_program({ id: renaming.program.id, name: renaming.name.trim() || renaming.program.name, notes: renaming.program.notes })
                .then(() => set_renaming(null));
            },
            submit_label: "Rename",
          }}
          buttons={
            <button type="button" onClick={() => set_renaming(null)}>
              Cancel
            </button>
          }
        >
          <input type="text" aria-label="Program name" autoFocus value={renaming.name} onChange={(event) => set_renaming({ ...renaming, name: event.currentTarget.value })} />
        </Dialog>
      )}
    </>
  );
}
