// The Diet section's settings: the daily targets, the USDA key for food lookup, the grocery comment prefill, and the
// import and export of the Trilium Diet Manager's database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { CommitInput, NumberField, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { nutrients, target_key } from "../../shared/diet/model.ts";
import { calls } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { energy_unit_of, error_text, field_value, shown_unit, to_shown_value, to_stored_value } from "./format.ts";

// ── Targets ──────────────────────────────────────────────────────────────────

// A target of 0 means none, and the day shows the total alone.
export function TargetSettings({ settings, set_setting }: FeatureSettingsProps) {
  const energy = energy_unit_of(settings);
  return (
    <>
      {nutrients.map((info) => {
        const unit = shown_unit(info, energy);
        const stored = Number(settings[target_key(info.key)] ?? 0);
        return (
          <SettingRow key={info.key} label={`${info.label} (${unit})`}>
            <NumberField
              label={`${info.label} target`}
              bare
              min={0}
              step={info.shown === "g" ? 5 : 50}
              unit={unit}
              value={field_value(to_shown_value(info, stored, energy))}
              on_change={(shown) => void set_setting(target_key(info.key), to_stored_value(info, shown ?? 0, energy))}
            />
          </SettingRow>
        );
      })}
    </>
  );
}

// ── Lookup and grocery ───────────────────────────────────────────────────────

export function LookupSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <SettingRow
      label="USDA FoodData Central API key"
      hint="A free key from fdc.nal.usda.gov/api-key-signup.html adds USDA results to food lookup. Open Food Facts is searched either way."
      as_label
    >
      <CommitInput
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={String(settings["diet.usda_api_key"] ?? "")}
        on_commit={(event) => {
          const key = event.currentTarget.value.trim();
          if (key !== settings["diet.usda_api_key"]) void set_setting("diet.usda_api_key", key);
        }}
      />
    </SettingRow>
  );
}

export function GrocerySettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <SettingRow label="Prefill grocery comments from the food" hint="A new grocery line's comment starts as the food's own comment; the line's copy can be edited without touching the food.">
      <Switch label="Prefill grocery comments from the food" checked={settings["diet.prefill_grocery_comment"] === true} on_change={(on) => set_setting("diet.prefill_grocery_comment", on)} />
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

export function DataSettings() {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, set_busy] = useState(false);

  async function import_file(file: File | undefined): Promise<void> {
    if (!file) return;
    set_busy(true);
    try {
      const counts = await calls().import_trilium_diet(await file.text());
      toast(`Imported ${counts.foods} food(s), ${counts.recipes} recipe(s), ${counts.diary} diary entr${counts.diary === 1 ? "y" : "ies"} and ${counts.grocery} grocery line(s).`, { tone: "good" });
    } catch (error) {
      toast(`Could not import: ${error_text(error)}`, { tone: "bad" });
    } finally {
      set_busy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  async function export_file(): Promise<void> {
    try {
      download("diet-manager-database.json", await calls().export_diet_json());
    } catch (error) {
      toast(error_text(error), { tone: "bad" });
    }
  }

  return (
    <>
      <SettingRow
        label="Import from Trilium Diet Manager"
        hint="Merges the add-on's database.json or its Export JSON file: foods and recipes with the same id are replaced, and diary entries and grocery lines already here are kept, so importing a file twice adds nothing."
      >
        <input ref={picker} type="file" accept="application/json,.json" aria-label="Diet Manager database file" hidden onChange={(event) => void import_file(event.currentTarget.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => picker.current?.click()}>{busy ? "Importing…" : "Import…"}</button>
      </SettingRow>
      <SettingRow label="Export" hint="The whole diet as one JSON file in the add-on's format, which imports back here or into the add-on.">
        <button type="button" onClick={() => void export_file()}>Export JSON</button>
      </SettingRow>
    </>
  );
}
