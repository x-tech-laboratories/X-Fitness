// The Body settings: the height BMI is worked out from, the sex the 3D body is built on, the birth date the calculators
// take the age from, and moving the whole log in and out as JSON.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { CommitInput, NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls } from "../api.ts";
import { to_shown_value, to_stored_value, type ShownUnits } from "./format.ts";

// ── Height ───────────────────────────────────────────────────────────────────

const height_measure = { kind: "length", unit: "" } as const;

export function HeightSetting({ height, units, set_setting }: { height: number; units: ShownUnits; set_setting: (key: string, value: unknown) => Promise<void> }) {
  const shown = height > 0 ? to_shown_value(height_measure, height, units) : null;
  return (
    <SettingRow label="Height" hint="Turns on BMI from the Weight metric. Leave empty to hide it.">
      <NumberField
        bare
        label="Height"
        value={shown}
        min={0}
        step={0.5}
        unit={units.length}
        on_change={(value) => {
          if (value !== shown) void set_setting("body.height", value ? to_stored_value(height_measure, value, units) : 0);
        }}
      />
    </SettingRow>
  );
}

// ── Sex ──────────────────────────────────────────────────────────────────────

const sex_options: [string, string][] = [["", "Not set"], ["female", "Female"], ["male", "Male"]];

export function SexSetting({ sex, set_setting }: { sex: string; set_setting: (key: string, value: unknown) => Promise<void> }) {
  return (
    <SettingRow label="Sex" hint="The body the 3D tab starts from and the calculators use; not set mixes the two.">
      <Select bare label="Sex" options={sex_options} value={sex} on_change={(value) => void set_setting("body.sex", value)} />
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

// ── Import and export ────────────────────────────────────────────────────────

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Merges a file in, never wiping: new metrics are added and readings already here are kept.
export function BodyData({ units }: { units: ShownUnits }) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, set_busy] = useState(false);

  async function import_file(file: File): Promise<void> {
    set_busy(true);
    try {
      const result = await calls().import_trilium_body(await file.text(), { mass_unit: units.mass, length_unit: units.length });
      toast(`Imported ${result.metrics} metric(s) and ${result.days} day(s): ${result.added_metrics} new metric(s), ${result.added_readings} new reading(s).`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${error instanceof Error ? error.message : String(error)}`, { tone: "bad" });
    } finally {
      set_busy(false);
    }
  }

  async function export_file(): Promise<void> {
    download("body-metrics-database.json", await calls().export_body());
  }

  return (
    <>
      <SettingRow
        label="Import JSON"
        hint={`A database.json from the Trilium Body Metrics add-on, or a file exported here. Weights and lengths in an add-on file are read as ${units.mass} and ${units.length}, the units chosen above.`}
      >
        <input
          ref={picker}
          type="file"
          accept="application/json,.json"
          aria-label="Body metrics file"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void import_file(file);
          }}
        />
        <button type="button" disabled={busy} onClick={() => picker.current?.click()}>{busy ? "Importing…" : "Import JSON…"}</button>
      </SettingRow>
      <SettingRow label="Export JSON" hint="The whole log as one file, in kg and cm, in the add-on's shape.">
        <button type="button" onClick={() => void export_file()}>Export JSON</button>
      </SettingRow>
    </>
  );
}
