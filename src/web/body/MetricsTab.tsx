// The Metrics tab: what is measured, in the order every other tab shows it, each added, edited, moved or deleted here.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog, open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, RowActions, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { metric_kinds, type BodyMetric, type MetricKind } from "../../shared/body/readings.ts";
import type { MetricSummary } from "../../shared/body/store.ts";
import { calls, use_data } from "../api.ts";
import { format_value, to_shown_value, to_stored_value, unit_of, type ShownUnits } from "./format.ts";

// ── Form ─────────────────────────────────────────────────────────────────────

interface Draft {
  name: string;
  kind: MetricKind;
  unit: string;
  // In the unit shown.
  goal: number | null;
  comment: string;
}

function MetricDialog({ metric, units, on_close }: { metric: BodyMetric | null; units: ShownUnits; on_close: () => void }) {
  const [draft, set_draft] = useState<Draft>(() => ({
    name: metric?.name ?? "",
    kind: metric?.kind ?? "weight",
    unit: metric?.unit ?? "",
    goal: metric && metric.goal > 0 ? to_shown_value(metric, metric.goal, units) : null,
    comment: metric?.comment ?? "",
  }));
  const update = (changes: Partial<Draft>) => set_draft((current) => ({ ...current, ...changes }));
  const unit = unit_of(draft, units);

  async function save(): Promise<void> {
    // A goal kept as it was is not converted back, so switching units never nudges it.
    const kept = metric && metric.kind === draft.kind && draft.goal === (metric.goal > 0 ? to_shown_value(metric, metric.goal, units) : null);
    const goal = kept ? metric.goal : draft.goal ? to_stored_value(draft, draft.goal, units) : 0;
    try {
      await calls().save_body_metric({ id: metric?.id, name: draft.name, kind: draft.kind, unit: draft.unit, goal, comment: draft.comment });
      on_close();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { tone: "bad" });
    }
  }

  return (
    <Dialog
      title={metric ? `Edit ${metric.name}` : "Add metric"}
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
      <FormRow label="Note" id="body-metric-note">
        <textarea id="body-metric-note" rows={2} value={draft.comment} onChange={(event) => update({ comment: event.currentTarget.value })} />
      </FormRow>
    </Dialog>
  );
}

export function edit_metric(metric: BodyMetric | null, units: ShownUnits): void {
  open_dialog((close) => <MetricDialog metric={metric} units={units} on_close={close} />);
}

// ── List ─────────────────────────────────────────────────────────────────────

// A metric's readings go with it, since nothing else could show them; the confirmation says how many.
function delete_metric(metric: MetricSummary): void {
  confirm_dialog({
    title: `Delete metric "${metric.name}"?`,
    message: metric.readings > 0 ? `Its ${metric.readings} reading${metric.readings === 1 ? " is" : "s are"} deleted with it.` : "It has no readings.",
    confirm_label: "Delete",
    danger: true,
    run: async () => void (await calls().delete_body_metric(metric.id)),
  });
}

interface MetricRow extends MetricSummary {
  index: number;
  count: number;
  units: ShownUnits;
}

const columns: TableColumn<MetricRow>[] = [
  { label: "Name", cell: (row) => <span title={row.comment || undefined}>{row.name}</span> },
  {
    label: "Measured in",
    cell: (row) => {
      const unit = unit_of(row, row.units);
      return `${metric_kinds.find((kind) => kind.key === row.kind)?.label ?? row.kind}${unit ? ` (${unit})` : ""}`;
    },
  },
  { label: "Goal", cell: (row) => (row.goal > 0 ? format_value(row, row.goal, row.units) : "—") },
  { label: "Readings", cell: (row) => row.readings },
  { label: "Last taken", cell: (row) => row.last_date || "—" },
  {
    label: "Actions",
    id: "actions",
    cell: (row) => (
      <>
        <button type="button" className="icon" aria-label={`Edit ${row.name}`} onClick={() => edit_metric(row, row.units)}>✎</button>
        <RowActions
          index={row.index}
          count={row.count}
          on_move={(from, to) => void calls().move_body_metric(row.id, to - from)}
          on_remove={() => delete_metric(row)}
          remove_label={`Delete ${row.name}`}
        />
      </>
    ),
  },
];

export function MetricsTab({ units }: { units: ShownUnits }) {
  const metrics = use_data((api) => api.list_body_metrics());

  return (
    <div className="stack">
      <Toolbar>
        <button type="button" className="accent solid" onClick={() => edit_metric(null, units)}>Add metric</button>
      </Toolbar>
      <Loaded resource={metrics}>
        {(list) =>
          list.length === 0 ? (
            <p className="muted">No metrics.</p>
          ) : (
            <DataTable caption="Metrics" columns={columns} rows={list.map((metric, index) => ({ ...metric, index, count: list.length, units }))} row_key={(row) => row.id} />
          )
        }
      </Loaded>
    </div>
  );
}
