// The settings Workouts → Training and Reports work from: the bar and plates, the lifts and run the scores and race
// times read, the METs each kind of exercise burns at, and whether the diary eats workouts back.

// ── Imports ──────────────────────────────────────────────────────────────────

import { CommitInput, NumberField, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { bar_and_plates } from "../../shared/calculators/training.ts";
import type { Measurement } from "../../shared/workouts/model.ts";
import { use_data } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { UnitNumber } from "../unit_field.tsx";
import { shown_units, type ShownUnits } from "../units.ts";
import { field_to_shown, field_to_stored } from "./units.ts";

// ── Plates ───────────────────────────────────────────────────────────────────

// Plates such as 1.25 kg need their second decimal.
export function plate_text(plate: number, units: ShownUnits): string {
  return String(field_to_shown("weight", plate, units));
}

function Plates({ settings, set_setting }: FeatureSettingsProps) {
  const units = shown_units(settings);
  const { bar, plates } = bar_and_plates(settings.mass_unit, settings["calculators.bar_weight"], settings["calculators.plates"]);
  const shown_plates = plates.map((plate) => plate_text(plate, units)).join(", ");
  return (
    <>
      <UnitNumber
        setting_row
        label="Bar"
        hint="The bar's own weight, which the plates calculator loads on top of."
        value={bar}
        to_shown={(kg) => field_to_shown("weight", kg, units)}
        to_stored={(shown) => field_to_stored("weight", shown, units)}
        min={0}
        step={units.mass === "lb" ? 5 : 2.5}
        unit={units.mass}
        on_change={(kg) => void set_setting("calculators.bar_weight", kg)}
      />
      <SettingRow label="Plates you have" hint={`The weights of the plates you can load, in ${units.mass}, separated by commas.`}>
        <CommitInput
          aria-label="Plates you have"
          type="text"
          value={shown_plates}
          on_commit={(event) => {
            const typed = event.currentTarget.value.split(/[,\s]+/).map(Number).filter((plate) => plate > 0);
            if (event.currentTarget.value !== shown_plates) void set_setting("calculators.plates", typed.map((plate) => field_to_stored("weight", plate, units)));
          }}
        />
      </SettingRow>
    </>
  );
}

// ── Exercises ────────────────────────────────────────────────────────────────

const picks: { key: string; label: string; measurement: Measurement; hint: string }[] = [
  { key: "calculators.squat_exercise", label: "Squat", measurement: "weight", hint: "The lift the strength scores take as the squat." },
  { key: "calculators.bench_exercise", label: "Bench press", measurement: "weight", hint: "The lift the strength scores take as the bench press." },
  { key: "calculators.deadlift_exercise", label: "Deadlift", measurement: "weight", hint: "The lift the strength scores take as the deadlift." },
  { key: "calculators.running_exercise", label: "Running exercise", measurement: "cardio", hint: "The runs VO2max, race times and the energy of runs by their pace are read from." },
];

function ExercisePicks({ settings, set_setting }: FeatureSettingsProps) {
  const library = use_data((api) => api.get_workout_library());
  return (
    <Loaded resource={library}>
      {(data) => (
        <>
          {picks.map((pick) => {
            const options: [string, string][] = [
              ["", "Guess from the names"],
              ...data.exercises.filter((exercise) => exercise.measurement === pick.measurement).map((exercise): [string, string] => [exercise.id, exercise.name]),
            ];
            const value = String(settings[pick.key] ?? "");
            return (
              <SettingRow key={pick.key} label={pick.label} hint={pick.hint}>
                <Select bare label={pick.label} options={options} value={options.some(([id]) => id === value) ? value : ""} on_change={(id) => void set_setting(pick.key, id)} />
              </SettingRow>
            );
          })}
        </>
      )}
    </Loaded>
  );
}

// ── Energy ───────────────────────────────────────────────────────────────────

const met_rows: { key: string; label: string }[] = [
  { key: "calculators.met_weight", label: "Weights" },
  { key: "calculators.met_bodyweight", label: "Bodyweight" },
  { key: "calculators.met_duration", label: "Timed" },
  { key: "calculators.met_cardio", label: "Cardio" },
];

function WorkoutEnergySettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <>
      {met_rows.map((row) => {
        const value = Number(settings[row.key]) || null;
        return (
          <SettingRow key={row.key} label={`${row.label} MET`} hint="The work of this kind of exercise as a multiple of resting; runs go by their pace.">
            <NumberField bare label={`${row.label} MET`} value={value} min={1} step={0.1} on_change={(next) => next && next !== value && void set_setting(row.key, next)} />
          </SettingRow>
        );
      })}
      <SettingRow label="Add workouts to the diary's calorie target" hint="Each day's calorie target in the diary grows by what that day's workouts burned. Best with the activity on Goals set to Sedentary, so exercise is not counted twice.">
        <Switch label="Add workouts to the diary's calorie target" checked={settings["calculators.eat_back_workouts"] === true} on_change={(on) => set_setting("calculators.eat_back_workouts", on)} />
      </SettingRow>
    </>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function TrainingSettings(props: FeatureSettingsProps) {
  return (
    <>
      <Plates {...props} />
      <ExercisePicks {...props} />
      <WorkoutEnergySettings {...props} />
    </>
  );
}
