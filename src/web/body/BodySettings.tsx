// The Body settings: the height BMI is worked out from, the sex the 3D body is built on and the birth date the calculators
// take the age from.

// ── Imports ──────────────────────────────────────────────────────────────────

import { CommitInput, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { Sex } from "../../shared/calculators/formulas.ts";
import { sex_options } from "../calculators/options.ts";
import { UnitNumber } from "../unit_field.tsx";
import type { ShownUnits } from "../units.ts";
import { body_measures, to_shown_value, to_stored_value } from "./format.ts";

// ── Height ───────────────────────────────────────────────────────────────────

export function HeightSetting({ height, units, set_setting }: { height: number; units: ShownUnits; set_setting: (key: string, value: unknown) => Promise<void> }) {
  return (
    <UnitNumber
      setting_row
      label="Height"
      hint="Turns on BMI from the Weight metric. Leave empty to hide it."
      value={height}
      to_shown={(value) => to_shown_value(body_measures.length, value, units)}
      to_stored={(value) => to_stored_value(body_measures.length, value, units)}
      min={0}
      step={0.5}
      unit={units.length}
      on_change={(value) => void set_setting("body.height", value)}
    />
  );
}

// ── Sex ──────────────────────────────────────────────────────────────────────

export function SexSetting({ sex, set_setting }: { sex: string; set_setting: (key: string, value: unknown) => Promise<void> }) {
  return (
    <SettingRow label="Sex" hint="The body the 3D tab starts from and the calculators use; not set mixes the two.">
      <Select bare label="Sex" options={sex_options} value={sex as Sex} on_change={(value) => void set_setting("body.sex", value)} />
    </SettingRow>
  );
}

// ── Birth date ───────────────────────────────────────────────────────────────

export function BirthDateSetting({ birth_date, set_setting }: { birth_date: string; set_setting: (key: string, value: unknown) => Promise<void> }) {
  return (
    <SettingRow label="Birth date" hint="The calculators take your age from it, for body fat by calipers and the energy you burn." as_label>
      <CommitInput
        type="date"
        value={birth_date}
        on_commit={(event) => {
          const value = event.currentTarget.value;
          if (value !== birth_date) void set_setting("body.birth_date", value);
        }}
      />
    </SettingRow>
  );
}
