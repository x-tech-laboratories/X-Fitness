// Programs, the plans: each a named block of sessions in the order it runs, each session the exercises of one day with
// their sets, targets, rest and progression, any of which starts today's workout.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useState } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Card, Cards, FormRow, RowActions, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { category_path_text } from "../../shared/category_tree.ts";
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
import { calls, succeeds } from "../api.ts";
import { CategoryEditor } from "../categories.tsx";
import { AddNameForm, DialogButtons, use_rename } from "../forms.tsx";
import { HistoryButton } from "../history/HistoryView.tsx";
import { confirm_delete } from "../rows.tsx";
import { UnitNumber } from "../unit_field.tsx";
import type { ShownUnits } from "../units.ts";
import { ExerciseSelect } from "./controls.tsx";
import { field_labels, field_to_shown, field_to_stored, field_unit, format_field } from "./units.ts";

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
        return (
          <div key={key} className="inline-row">
            <UnitNumber
              label={field.label}
              value={progression[key]}
              to_shown={is_weight ? (value) => field_to_shown("weight", value, units) : undefined}
              to_stored={is_weight ? (value) => field_to_stored("weight", value, units) : undefined}
              show_zero
              min={0}
              step={field.step}
              on_change={(value) => on_change(normalize_progression({ ...progression, [key]: value }))}
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
    if (await succeeds(() => calls().save_program_session(program.id, { ...session, id: session.id || undefined, categories: session.categories }))) on_close();
  }

  return (
    <Dialog
      title={initial ? `Edit ${initial.name}` : "Add Session"}
      subtitle={program.name}
      full
      on_close={on_close}
      buttons={<DialogButtons on_save={() => void save()} on_cancel={on_close} />}
    >
      <div className="form-rows">
        <FormRow label="Name" id="session-name">
          <input id="session-name" type="text" value={session.name} onChange={(event) => set_session({ ...session, name: event.currentTarget.value })} />
        </FormRow>
        <FormRow label="Categories" id="session-categories">
          <CategoryEditor categories={library.categories} values={session.categories} on_change={(categories) => set_session({ ...session, categories })} />
        </FormRow>
        <FormRow label="Notes" id="session-notes">
          <textarea id="session-notes" rows={2} value={session.notes} onChange={(event) => set_session({ ...session, notes: event.currentTarget.value })} />
        </FormRow>
      </div>

      <h3>Exercises</h3>
      {session.entries.length === 0 && <Empty title="No exercises in this session yet." />}
      <Stack tight>
        {session.entries.map((entry, index) => {
          const exercise = exercises.get(entry.exercise_id);
          const label = exercise?.name ?? `Exercise ${index + 1}`;
          return (
            <fieldset key={entry.id} className="card workouts-entry-form" aria-label={label}>
              <div className="spread-row">
                <ExerciseSelect label={`Exercise ${index + 1}`} exercises={library.exercises} categories={library.categories} value={entry.exercise_id} placeholder="Pick an exercise…" on_change={(exercise_id) => change_entry(entry.id, { exercise_id })} />
                <RowActions index={index} count={session.entries.length} on_move={move} on_remove={() => set_session({ ...session, entries: session.entries.filter((item) => item.id !== entry.id) })} remove_label={`Remove ${label}`} />
              </div>
              <div className="workouts-fields">
                <NumberField label="Sets" value={entry.sets} min={1} on_change={(sets) => change_entry(entry.id, { sets: sets ?? 1 })} />
                {exercise &&
                  measurement_of(exercise.measurement).fields.map((field) => (
                    <UnitNumber
                      key={field}
                      label={`Target ${field_labels[field].toLowerCase()}`}
                      unit={field_unit(field, units)}
                      value={entry[field]}
                      to_shown={(value) => field_to_shown(field, value, units)}
                      to_stored={(value) => field_to_stored(field, value, units)}
                      show_zero
                      min={0}
                      step={field === "reps" ? 1 : 0.5}
                      on_change={(value) => change_entry(entry.id, { [field]: value })}
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
  const [editing, set_editing] = useState<{ program: Program; session: Session | null } | null>(null);
  const rename = use_rename<Program>((program, name) => void succeeds(() => calls().save_program({ id: program.id, name, notes: program.notes })));
  const exercises = new Map(library.exercises.map((exercise) => [exercise.id, exercise]));

  async function start(session: Session): Promise<void> {
    if (await succeeds(() => calls().start_workout(today(), session.id, new Date().toISOString()))) location.hash = "#/workouts/log";
  }

  function delete_program(program: Program): void {
    const count = program.sessions.length;
    confirm_delete(`Delete ${program.name}?`, `${count > 0 ? `Its ${count} session(s) go with it. ` : ""}Workouts already logged are kept.`, () => succeeds(() => calls().delete_program(program.id)));
  }

  function delete_session(session: Session): void {
    confirm_delete(`Delete ${session.name}?`, "Workouts logged from it are kept.", () => succeeds(() => calls().delete_program_session(session.id)));
  }

  return (
    <>
      <AddNameForm label="New program" button="Add Program" on_add={(name) => succeeds(() => calls().save_program({ name }))} />
      {library.programs.length === 0 && <Empty title="No programs yet." hint="A program groups the sessions of a training block, such as Push, Pull and Legs." />}
      <Stack>
        {library.programs.map((program) => (
          <Section
            key={program.id}
            title={rename.renaming?.id === program.id ? rename.field(program, program.name) : program.name}
            tools={
              <>
                <span className="muted small">{`${program.sessions.length} session(s)`}</span>
                <button type="button" onClick={() => set_editing({ program, session: null })}>
                  Add Session
                </button>
                <button type="button" onClick={() => rename.start(program)} aria-label={`Rename ${program.name}`}>
                  Rename
                </button>
                <HistoryButton kind="program" item_id={program.id} name={program.name} />
                <button type="button" className="danger" onClick={() => delete_program(program)} aria-label={`Delete ${program.name}`}>
                  Delete
                </button>
              </>
            }
          >
            {program.notes && <p className="muted">{program.notes}</p>}
            {program.sessions.length === 0 && <Empty title="No sessions in this program yet." />}
            <Cards>
              {program.sessions.map((session, index) => (
                <Card key={session.id} title={session.name} subtitle={[`${session.entries.length} exercise(s)`, ...session.categories.map((id) => category_path_text(id, library.categories))].join(" · ")}>
                  {session.notes && <p className="muted small">{session.notes}</p>}
                  <ul className="close-list">
                    {session.entries.map((entry) => {
                      const exercise = exercises.get(entry.exercise_id);
                      return exercise ? <li key={entry.id}>{plan_line(entry, exercise, units)}</li> : <Fragment key={entry.id} />;
                    })}
                  </ul>
                  <div className="spread-row">
                    <span className="inline-row">
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
                      on_move={(from, to) => void succeeds(() => calls().move_program_session(session.id, to > from ? 1 : -1))}
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
    </>
  );
}
