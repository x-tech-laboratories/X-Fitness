// The Log tab: one day at a time, a reading per metric with the one before it, BMI, and the day's note.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { format_number } from "@x-tech-laboratories/x-libs/units";
import { NumberField, PeriodStepper } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import type { DayRow } from "../../shared/body/store.ts";
import { attempt, calls, use_data } from "../api.ts";
import { HistoryButton } from "../history/HistoryView.tsx";
import { format_mass, type ShownUnits } from "../units.ts";
import { format_change, format_value, to_shown_value, to_stored_value, unit_of } from "./format.ts";

// ── Log ──────────────────────────────────────────────────────────────────────

// A row carries its day and units, so a table row that only draws again when its row changes never shows stale ones.
interface LogRow extends DayRow {
  date: string;
  units: ShownUnits;
}

function save_reading(row: LogRow, shown: number | null): void {
  const current = row.value === null ? null : to_shown_value(row.metric, row.value, row.units);
  // Leaving the field as it was must not round the stored value to what is shown.
  if (shown === current) return;
  void attempt(() => calls().set_body_reading(row.metric.id, row.date, shown === null ? null : to_stored_value(row.metric, shown, row.units)));
}

const columns: TableColumn<LogRow>[] = [
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
    cell: (row) =>
      row.previous ? (
        <span>
          {format_value(row.metric, row.previous.value, row.units)}
          <span className="muted small">{` on ${row.previous.date}`}</span>
          {row.value !== null && <span className="muted small">{` (${format_change(row.metric, row.value - row.previous.value, row.units)})`}</span>}
        </span>
      ) : "—",
  },
  { label: "Goal", cell: (row) => (row.metric.goal > 0 ? format_value(row.metric, row.metric.goal, row.units) : "—") },
];

export function LogTab({ units }: { units: ShownUnits }) {
  const [date, set_date] = useState(today);
  const day = use_data((api) => api.get_body_day(date), [date]);

  return (
    <div className="stack">
      <Toolbar>
        <PeriodStepper label="Day" period="day" value={date} on_change={set_date} />
        <HistoryButton kind="body_day" item_id={date} name={`Body on ${date}`} />
      </Toolbar>
      <Loaded resource={day}>
        {(loaded) => (
          <>
            {loaded.rows.length === 0 ? (
              <Empty title="No metrics." hint="Add some in the Metrics tab." />
            ) : (
              <DataTable caption={`Readings on ${loaded.date}`} columns={columns} rows={loaded.rows.map((row) => ({ ...row, date: loaded.date, units }))} row_key={(row) => row.metric.id} />
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
