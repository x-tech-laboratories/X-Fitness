// The Metrics page: one day at a time, a reading per metric with the one before it and its goal, BMI and the day's
// note, and each metric added here or opened with Edit to change, move or delete it.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Dialog, open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, RowActions, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { metric_kinds, metric_roles, type BodyMetric, type MetricKind, type MetricRole } from "../../shared/body/readings.ts";
import type { DayRow, MetricSummary } from "../../shared/body/store.ts";
import { attempt, calls, succeeds, use_data } from "../api.ts";
import { DayStepper, use_day } from "../day.tsx";
import { HistoryButton } from "../history/HistoryView.tsx";
import { confirm_delete, row_actions_column } from "../rows.tsx";
import { format_mass, type ShownUnits } from "../units.ts";
import { format_change, format_value, to_shown_value, to_stored_value, unit_of } from "./format.ts";

// ── Form ─────────────────────────────────────────────────────────────────────

interface Draft {
  name: string;
  kind: MetricKind;
  unit: string;
  // In the unit shown.
  goal: number | null;
  comment: string;
  role: MetricRole;
}

// Body fat comes as a percent, girths and skinfolds as lengths and the resting pulse in its own unit, so each kind offers only the roles it can fill.
function roles_for(kind: MetricKind): [MetricRole, string][] {
  const fits = (role: MetricRole) => {
    if (kind === "percent") return role === "body_fat";
    if (kind === "custom") return role === "resting_heart_rate";
    return kind === "length" && role !== "body_fat" && role !== "resting_heart_rate";
  };
  return metric_roles
    .filter((role) => role.key === "" || fits(role.key))
    .map((role) => [role.key, role.label]);
}

// A metric's readings go with it, since nothing else could show them; the confirmation says how many.
function delete_metric(metric: MetricSummary, on_deleted: () => void): void {
  const readings = metric.readings > 0 ? `Its ${metric.readings} reading${metric.readings === 1 ? " is" : "s are"} deleted with it.` : "It has no readings.";
  confirm_delete(`Delete metric "${metric.name}"?`, readings, async () => {
    if (await succeeds(() => calls().delete_body_metric(metric.id))) on_deleted();
  });
}

// How many readings a metric has and when it was last taken, such as "12 readings, last taken 2026-11-10".
function readings_text(metric: MetricSummary): string {
  if (metric.readings === 0) return "No readings yet.";
  return `${metric.readings} reading${metric.readings === 1 ? "" : "s"}, last taken ${metric.last_date}.`;
}

function MetricDialog({ metric, units, on_close }: { metric: BodyMetric | null; units: ShownUnits; on_close: () => void }) {
  const [draft, set_draft] = useState<Draft>(() => ({
    name: metric?.name ?? "",
    kind: metric?.kind ?? "weight",
    unit: metric?.unit ?? "",
    goal: metric && metric.goal > 0 ? to_shown_value(metric, metric.goal, units) : null,
    comment: metric?.comment ?? "",
    role: metric?.role ?? "",
  }));
  const update = (changes: Partial<Draft>) => set_draft((current) => ({ ...current, ...changes }));
  const roles = roles_for(draft.kind);
  const role = roles.some(([key]) => key === draft.role) ? draft.role : "";
  const unit = unit_of({ ...draft, role }, units);
  // The list is read afresh, so moving the metric from here shows at once.
  const metrics = use_data((api) => api.list_body_metrics());
  const list = metrics.data ?? [];
  const index = metric ? list.findIndex((each) => each.id === metric.id) : -1;
  const summary = list[index];

  async function save(): Promise<void> {
    // A goal kept as it was is not converted back, so switching units never nudges it.
    const kept = metric && metric.kind === draft.kind && metric.role === role && draft.goal === (metric.goal > 0 ? to_shown_value(metric, metric.goal, units) : null);
    const goal = kept ? metric.goal : draft.goal ? to_stored_value({ ...draft, role }, draft.goal, units) : 0;
    if (await succeeds(() => calls().save_body_metric({ id: metric?.id, name: draft.name, kind: draft.kind, unit: draft.unit, goal, comment: draft.comment, role }))) on_close();
  }

  return (
    <Dialog
      title={metric ? `Edit ${metric.name}` : "Add metric"}
      subtitle={summary ? readings_text(summary) : undefined}
      actions={
        summary && (
          <>
            <HistoryButton kind="metric" item_id={summary.id} name={summary.name} />
            <RowActions index={index} count={list.length} on_move={(from, to) => void succeeds(() => calls().move_body_metric(summary.id, to - from))} remove_label={`Delete ${summary.name}`} />
          </>
        )
      }
      buttons={
        summary && (
          <button type="button" className="danger" aria-label={`Delete ${summary.name}`} onClick={() => delete_metric(summary, on_close)}>
            Delete
          </button>
        )
      }
      on_close={on_close}
      form={{ on_submit: (event) => { event.preventDefault(); void save(); }, submit_label: "Save", submit_disabled: !draft.name.trim() }}
    >
      <FormRow label="Name" id="body-metric-name">
        <input id="body-metric-name" type="text" required value={draft.name} onChange={(event) => update({ name: event.currentTarget.value })} />
      </FormRow>
      <FormRow label="Measured in" id="body-metric-kind">
        <Select label="Measured in" bare options={metric_kinds.map((kind): [MetricKind, string] => [kind.key, kind.label])} value={draft.kind} on_change={(kind) => update({ kind })} />
      </FormRow>
      <FormRow label="Unit" id="body-metric-unit" hidden={draft.kind !== "custom"}>
        <input id="body-metric-unit" type="text" placeholder="bpm, mmHg, ..." value={draft.unit} onChange={(event) => update({ unit: event.currentTarget.value })} />
      </FormRow>
      <FormRow label="Goal" id="body-metric-goal" hint="Leave empty for none.">
        <NumberField bare label="Goal" value={draft.goal} min={0} step={0.1} unit={unit || undefined} on_change={(goal) => update({ goal: goal || null })} />
      </FormRow>
      <FormRow label="Stands for" id="body-metric-role" hidden={roles.length < 2} hint="Body fat and girths shape the 3D body, and every role feeds the calculators; weight always does both. Skinfolds are shown in mm.">
        <Select label="Stands for" bare options={roles} value={role} on_change={(value) => update({ role: value })} />
      </FormRow>
      <FormRow label="Note" id="body-metric-note">
        <textarea id="body-metric-note" rows={2} value={draft.comment} onChange={(event) => update({ comment: event.currentTarget.value })} />
      </FormRow>
    </Dialog>
  );
}

export function edit_metric(metric: BodyMetric | null, units: ShownUnits): void {
  open_dialog((close) => <MetricDialog metric={metric} units={units} on_close={close} />);
}

// ── Readings ─────────────────────────────────────────────────────────────────

// A row carries its day and units, so a table row that only draws again when its row changes never shows stale ones.
interface ReadingRow extends DayRow {
  date: string;
  units: ShownUnits;
}

function save_reading(row: ReadingRow, shown: number | null): void {
  const current = row.value === null ? null : to_shown_value(row.metric, row.value, row.units);
  // Leaving the field as it was must not round the stored value to what is shown.
  if (shown === current) return;
  void attempt(() => calls().set_body_reading(row.metric.id, row.date, shown === null ? null : to_stored_value(row.metric, shown, row.units)));
}

// Previous and Goal hide on a phone, leaving each metric one line of its name, reading and Edit.
const wide_only = "body-wide-only";

const columns: TableColumn<ReadingRow>[] = [
  { label: "Metric", cell: (row) => <span title={row.metric.comment || undefined}>{row.metric.name}</span> },
  {
    label: "Reading",
    cell: (row) => (
      <NumberField
        bare
        label={row.metric.name}
        value={row.value === null ? null : to_shown_value(row.metric, row.value, row.units)}
        min={0}
        step={0.1}
        unit={unit_of(row.metric, row.units)}
        on_change={(shown) => save_reading(row, shown)}
      />
    ),
  },
  {
    label: "Previous",
    class: wide_only,
    groupable: false,
    filterable: false,
    cell: (row) =>
      row.previous ? (
        <span>
          {format_value(row.metric, row.previous.value, row.units)}
          <span className="muted small">{` on ${row.previous.date}`}</span>
          {row.value !== null && <span className="muted small">{` (${format_change(row.metric, row.value - row.previous.value, row.units)})`}</span>}
        </span>
      ) : "—",
  },
  { label: "Goal", class: wide_only, groupable: false, filterable: false, cell: (row) => (row.metric.goal > 0 ? format_value(row.metric, row.metric.goal, row.units) : "—") },
  row_actions_column<ReadingRow>({ name: (row) => row.metric.name, edit: (row) => edit_metric(row.metric, row.units) }),
];

// ── Page ─────────────────────────────────────────────────────────────────────

export function MetricsTab({ units }: { units: ShownUnits }) {
  const [date, set_date] = use_day();
  const day = use_data((api) => api.get_body_day(date), [date]);

  return (
    <div className="stack">
      <Toolbar>
        <DayStepper day={date} on_change={set_date} />
        <HistoryButton kind="body_day" item_id={date} name={`Body on ${date}`} />
        <button type="button" className="accent solid" onClick={() => edit_metric(null, units)}>Add metric</button>
      </Toolbar>
      <Loaded resource={day}>
        {(loaded) => (
          <>
            {loaded.rows.length === 0 ? (
              <Empty title="No metrics." hint="Add one with the Add metric button." />
            ) : (
              <DataTable caption={`Readings on ${loaded.date}`} wrap_class="body-readings" columns={columns} rows={loaded.rows.map((row) => ({ ...row, date: loaded.date, units }))} row_key={(row) => row.metric.id} />
            )}
            {loaded.bmi && (
              <p className="muted">
                {`BMI ${format_number(loaded.bmi.value)}, from ${format_mass(loaded.bmi.weight.value, units)} on ${loaded.bmi.weight.date}.`}
              </p>
            )}
            <label className="field body-note">
              <span className="field-label">Note</span>
              <textarea
                key={`${loaded.date}-${loaded.comment}`}
                rows={2}
                defaultValue={loaded.comment}
                onBlur={(event) => {
                  if (event.currentTarget.value.trim() !== loaded.comment) void attempt(() => calls().set_body_note(loaded.date, event.currentTarget.value));
                }}
              />
            </label>
          </>
        )}
      </Loaded>
    </div>
  );
}
