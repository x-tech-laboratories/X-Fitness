// The Log tab: one day at a time, a reading per metric with the one before it, BMI, and the day's note.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { format_local } from "@x-tech-laboratories/x-libs/dates";
import { DateTimeField, NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { shift_day } from "../../shared/body/readings.ts";
import type { DayRow } from "../../shared/body/store.ts";
import { calls, use_data } from "../api.ts";
import { format_change, format_number, format_value, to_shown_value, to_stored_value, unit_of, type ShownUnits } from "./format.ts";

// ── Log ──────────────────────────────────────────────────────────────────────

export function today(): string {
  return format_local(new Date(), false);
}

// A row carries its day and units, so a table row that only draws again when its row changes never shows stale ones.
interface LogRow extends DayRow {
  date: string;
  units: ShownUnits;
}

function save_reading(row: LogRow, shown: number | null): void {
  const current = row.value === null ? null : to_shown_value(row.metric, row.value, row.units);
  // Leaving the field as it was must not round the stored value to what is shown.
  if (shown === current) return;
  void calls().set_body_reading(row.metric.id, row.date, shown === null ? null : to_stored_value(row.metric, shown, row.units));
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
        <div className="body-day">
          <button type="button" className="icon" aria-label="Previous day" onClick={() => set_date(shift_day(date, -1))}>‹</button>
          <DateTimeField label="Day" value={date} allow_time={false} on_change={(value) => set_date(value || today())} />
          <button type="button" className="icon" aria-label="Next day" onClick={() => set_date(shift_day(date, 1))}>›</button>
        </div>
        <button type="button" onClick={() => set_date(today())}>Today</button>
      </Toolbar>
      <Loaded resource={day}>
        {(loaded) => (
          <>
            {loaded.rows.length === 0 ? (
              <p className="muted">No metrics. Add some in the Metrics tab.</p>
            ) : (
              <DataTable caption={`Readings on ${loaded.date}`} columns={columns} rows={loaded.rows.map((row) => ({ ...row, date: loaded.date, units }))} row_key={(row) => row.metric.id} />
            )}
            {loaded.bmi && (
              <p className="muted">
                {`BMI ${format_number(loaded.bmi.value)}, from ${format_value({ kind: "weight", unit: "" }, loaded.bmi.weight.value, units)} on ${loaded.bmi.weight.date}.`}
              </p>
            )}
            <label className="field body-note">
              <span className="field-label">Note</span>
              <textarea
                key={`${loaded.date}-${loaded.comment}`}
                rows={2}
                defaultValue={loaded.comment}
                onBlur={(event) => {
                  if (event.currentTarget.value.trim() !== loaded.comment) void calls().set_body_note(loaded.date, event.currentTarget.value);
                }}
              />
            </label>
          </>
        )}
      </Loaded>
    </div>
  );
}
