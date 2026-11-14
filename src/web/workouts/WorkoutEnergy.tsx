// The energy each workout of the last 30 days burned, from the METs under Settings → Workouts, the time and the weight.

// ── Imports ──────────────────────────────────────────────────────────────────

import { shift_day, today } from "@x-tech-laboratories/x-libs/dates";
import { format_measure, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { Section } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import type { WorkoutEnergy as WorkoutEnergyRow } from "../../shared/calculators/store.ts";
import { use_data } from "../api.ts";
import type { ShownUnits } from "../units.ts";
import { format_rest } from "./units.ts";

// ── Table ────────────────────────────────────────────────────────────────────

interface EnergyRow extends WorkoutEnergyRow {
  energy: EnergyUnit;
}

const energy_columns: TableColumn<EnergyRow>[] = [
  { label: "Date", cell: (row) => row.date },
  { label: "Workout", cell: (row) => row.name },
  { label: "Time", cell: (row) => format_rest(Math.round(row.seconds)) },
  { label: "Burned", cell: (row) => (row.calories === null ? "Needs a weight" : format_measure(row.calories, row.energy, 0)) },
];

const days_shown = 30;

// ── Section ──────────────────────────────────────────────────────────────────

export function WorkoutEnergy({ units }: { units: ShownUnits }) {
  const day = today();
  const energy = use_data((api) => api.list_workout_energy(shift_day(day, -(days_shown - 1)), day), [day]);
  return (
    <Section title="Workout energy">
      <p className="muted">
        Each exercise's MET times your weight and its time; a set of reps counts two minutes, a workout with a start and finish takes its own length, and runs go by their pace. The METs are under{" "}
        <a href="#/settings">Settings → Workouts</a>.
      </p>
      <Loaded resource={energy}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title={`No workouts in the last ${days_shown} days.`} />
          ) : (
            <DataTable caption={`Energy burned in the last ${days_shown} days`} columns={energy_columns} rows={[...rows].reverse().map((row) => ({ ...row, energy: units.energy }))} row_key={(row) => row.workout_id} />
          )
        }
      </Loaded>
    </Section>
  );
}
