// The log, one day at a time: its workouts, each started from a session or empty, edited in place as sets are done,
// with a rest timer between sets and Finish to progress the session it came from.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { CommitInput, NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Section, Stack, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";

import { measurement_of, workout_totals, type Exercise, type WorkoutEntry } from "../../shared/workouts/model.ts";
import type { LoggedWorkout, ProgressionReport, WorkoutLibrary } from "../../shared/workouts/store.ts";
import { attempt, calls, succeeds, use_data } from "../api.ts";
import { DayStepper, use_day } from "../day.tsx";
import { HistoryButton } from "../history/HistoryView.tsx";
import { confirm_delete } from "../rows.tsx";
import { UnitNumber } from "../unit_field.tsx";
import type { ShownUnits } from "../units.ts";
import { ExerciseSelect } from "./controls.tsx";
import { RestTimerBar, use_rest_timer } from "./rest_timer.tsx";
import { field_labels, field_to_shown, field_to_stored, field_unit, format_rest, format_weight } from "./units.ts";

// ── Entry ────────────────────────────────────────────────────────────────────

interface EntryProps {
  entry: WorkoutEntry;
  exercise: Exercise | undefined;
  units: ShownUnits;
  // Seconds the rest timer counts down from after this exercise's sets; none once the workout is finished.
  rest: number | null;
  on_rest: (seconds: number) => void;
}

function WorkoutEntryBlock({ entry, exercise, units, rest, on_rest }: EntryProps) {
  const fields = exercise ? measurement_of(exercise.measurement).fields : [];
  const name = exercise?.name ?? "Deleted exercise";
  return (
    <section className="workouts-entry" aria-label={name}>
      <div className="spread-row">
        <span className="inline-row">
          <strong>{name}</strong>
          {exercise && <span className="muted small">{measurement_of(exercise.measurement).label}</span>}
          {rest !== null && <span className="muted small">{`${format_rest(rest)} rest`}</span>}
        </span>
        <button type="button" className="icon remove" aria-label={`Remove ${name}`} onClick={() => void succeeds(() => calls().delete_workout_exercise(entry.id))}>
          ×
        </button>
      </div>
      <CommitInput type="text" aria-label={`Notes for ${name}`} placeholder="Notes…" value={entry.notes} on_commit={(event) => void succeeds(() => calls().update_workout_exercise(entry.id, { notes: event.currentTarget.value }))} />
      {entry.sets.length === 0 && <p className="muted small">No sets recorded.</p>}
      <ol className="workouts-sets">
        {entry.sets.map((set, index) => (
          <li key={set.id} className="workouts-set" aria-label={`${name} set ${index + 1}`}>
            <span className="workouts-set-number">{index + 1}</span>
            {fields.map((field) => (
              <UnitNumber
                key={field}
                label={field_labels[field]}
                bare
                unit={field_unit(field, units)}
                value={set[field]}
                to_shown={(value) => field_to_shown(field, value, units)}
                to_stored={(value) => field_to_stored(field, value, units)}
                min={0}
                step={field === "reps" ? 1 : field === "weight" ? 2.5 : 0.5}
                on_change={(value) => void succeeds(() => calls().update_workout_set(set.id, { [field]: value }))}
              />
            ))}
            <NumberField label="RPE" bare unit="RPE" value={set.rpe || null} min={0} max={10} step={0.5} on_change={(rpe) => void succeeds(() => calls().update_workout_set(set.id, { rpe: rpe ?? 0 }))} />
            <span className="row-actions">
              {rest !== null && rest > 0 && (
                <button type="button" onClick={() => on_rest(rest)} aria-label={`Rest ${format_rest(rest)}`}>
                  {`Rest ${format_rest(rest)}`}
                </button>
              )}
              <button type="button" className="icon remove" aria-label={`Remove set ${index + 1}`} onClick={() => void succeeds(() => calls().delete_workout_set(set.id))}>
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p>
        <button type="button" onClick={() => void succeeds(() => calls().add_workout_set(entry.id))} aria-label={`Add set to ${name}`}>
          Add Set
        </button>
      </p>
    </section>
  );
}

// ── Workout ──────────────────────────────────────────────────────────────────

// What finishing did to one exercise's plan, such as "Bench Press: 60 → 62.5 kg".
export function report_line(report: ProgressionReport, units: ShownUnits): string {
  if (report.outcome === "hold") return `${report.exercise_name}: unchanged${report.counter ? ` (${report.counter})` : ""}`;
  const moves = [];
  if (report.to.weight !== report.from.weight) moves.push(`${format_number(field_to_shown("weight", report.from.weight, units))} → ${format_weight(report.to.weight, units)}`);
  if (report.to.reps !== report.from.reps) moves.push(`${format_number(report.from.reps)} → ${format_number(report.to.reps)} reps`);
  return `${report.exercise_name}: ${moves.join(", ") || "unchanged"}`;
}

interface WorkoutCardProps {
  workout: LoggedWorkout;
  library: WorkoutLibrary;
  units: ShownUnits;
  default_rest: number;
  rest_sound: boolean;
}

function WorkoutCard({ workout, library, units, default_rest, rest_sound }: WorkoutCardProps) {
  const timer = use_rest_timer(rest_sound);
  // Kept until the card is drawn afresh: it confirms what finishing just did.
  const [reports, set_reports] = useState<ProgressionReport[] | null>(null);
  const exercises = new Map(library.exercises.map((exercise) => [exercise.id, exercise]));
  const totals = workout_totals(workout, new Map(library.exercises.map((exercise) => [exercise.id, exercise.measurement])));
  const is_open = workout.finished_at === "";

  function finish(): void {
    confirm_dialog({
      title: `Finish ${workout.name}?`,
      message: "Its progressions move the session's targets, which deleting the workout does not undo.",
      confirm_label: "Finish",
      run: async () => {
        const finished = await attempt(() => calls().finish_workout(workout.id, new Date().toISOString()));
        if (!finished) return;
        set_reports(finished);
        timer.stop();
      },
    });
  }

  function remove(): void {
    confirm_delete(`Delete ${workout.name}?`, `It was logged on ${workout.date}.`, () => succeeds(() => calls().delete_workout(workout.id)));
  }

  const summary = [
    `${totals.sets} set(s)`,
    totals.volume > 0 ? `${format_weight(totals.volume, units)} volume` : "",
    totals.duration > 0 ? `${format_number(totals.duration / 60)} min` : "",
    totals.distance > 0 ? `${format_number(field_to_shown("distance", totals.distance, units))} ${units.distance}` : "",
  ].filter(Boolean);

  return (
    <Section
      title={<CommitInput type="text" className="workouts-name" aria-label="Workout name" value={workout.name} on_commit={(event) => void succeeds(() => calls().update_workout(workout.id, { name: event.currentTarget.value }))} />}
      tools={
        <>
          <span className="muted small">{summary.join(" · ")}</span>
          {!is_open && <Badge tone="good">Finished</Badge>}
          {is_open && workout.has_session && (
            <button type="button" className="accent solid" onClick={finish}>
              Finish
            </button>
          )}
          <HistoryButton kind="workout" item_id={workout.id} name={workout.name || "Workout"} />
          <button type="button" className="danger" onClick={remove} aria-label={`Delete ${workout.name}`}>
            Delete
          </button>
        </>
      }
    >
      <CommitInput type="text" aria-label="How did it go?" placeholder="How did it go?" value={workout.notes} on_commit={(event) => void succeeds(() => calls().update_workout(workout.id, { notes: event.currentTarget.value }))} />
      {reports &&
        (reports.length > 0 ? (
          <ul className="close-list" aria-label="Progression">
            {reports.map((report) => (
              <li key={report.entry_id}>{report_line(report, units)}</li>
            ))}
          </ul>
        ) : (
          <Empty title="Nothing in this session has a progression." />
        ))}
      {workout.entries.map((entry) => (
        <WorkoutEntryBlock
          key={entry.id}
          entry={entry}
          exercise={exercises.get(entry.exercise_id)}
          units={units}
          // An exercise added mid-workout was never planned, so it rests for the default.
          rest={is_open ? entry.target.rest || default_rest : null}
          on_rest={timer.start}
        />
      ))}
      <ExerciseSelect
        label="Add an exercise"
        exercises={library.exercises}
        categories={library.categories}
        value=""
        placeholder="Add an exercise…"
        on_change={(exercise_id) => {
          if (exercise_id) void succeeds(() => calls().add_workout_exercise(workout.id, exercise_id));
        }}
      />
      {is_open && <RestTimerBar timer={timer} />}
    </Section>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

interface LogTabProps {
  library: WorkoutLibrary;
  units: ShownUnits;
  default_rest: number;
  rest_sound: boolean;
  // The day shown first; today unless set.
  initial_day?: string;
}

export function LogTab({ library, units, default_rest, rest_sound, initial_day }: LogTabProps) {
  const [day, set_day] = use_day({ initial: initial_day });
  const [session_id, set_session_id] = useState("");
  const workouts = use_data((api) => api.list_workouts(day), [day]);
  const session_groups = library.programs.map((program) => ({ label: program.name, options: program.sessions.map((session): [string, string] => [session.id, session.name]) }));

  async function start(chosen: string | null): Promise<void> {
    if (await succeeds(() => calls().start_workout(day, chosen, new Date().toISOString()))) set_session_id("");
  }

  return (
    <>
      <Toolbar>
        <DayStepper day={day} on_change={set_day} />
        <span className="inline-row">
          <Select label="Session" bare options={[["", session_groups.some((group) => group.options.length) ? "Start from a session…" : "No sessions yet"]]} groups={session_groups} value={session_id} on_change={set_session_id} />
          <button type="button" className="accent solid" disabled={!session_id} onClick={() => void start(session_id)}>
            Start
          </button>
          <button type="button" onClick={() => void start(null)}>
            Empty Workout
          </button>
        </span>
      </Toolbar>
      <Loaded resource={workouts}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="Nothing logged on this day." hint="Start a session or an empty workout." />
          ) : (
            <Stack>
              {list.map((workout) => (
                <WorkoutCard key={workout.id} workout={workout} library={library} units={units} default_rest={default_rest} rest_sound={rest_sound} />
              ))}
            </Stack>
          )
        }
      </Loaded>
    </>
  );
}
