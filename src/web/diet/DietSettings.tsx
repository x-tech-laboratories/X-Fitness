// The Diet section's settings: the nutrition label and target presets, each nutrient's switch and target, the USDA key for food lookup, the grocery comment prefill, and the
// import and export of the Trilium Diet Manager's database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { CommitInput, NumberField, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import {
  is_shown,
  label_preset_of,
  label_presets,
  plan_keys,
  preset_target,
  shown_overrides,
  target_of,
  target_override,
  target_preset_of,
  target_presets,
  target_source,
  with_shown,
} from "../../shared/diet/labels.ts";
import { nutrient_keys, nutrients, target_key, type NutrientGroup } from "../../shared/diet/model.ts";
import { calls } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { energy_unit_of, error_text, field_value, format_nutrient, shown_unit, to_shown_value, to_stored_value } from "./format.ts";

// ── Label and targets ────────────────────────────────────────────────────────

// The two presets, each with a way back to it once nutrients have been changed by hand.
export function LabelSettings({ settings, set_setting }: FeatureSettingsProps) {
  const changed_shown = Object.keys(shown_overrides(settings)).length;
  const changed_targets = nutrient_keys.filter((key) => target_override(settings, key) !== null && !plan_keys(settings).includes(key));
  return (
    <>
      <SettingRow
        label="Nutrition label"
        hint={changed_shown ? `Custom: ${changed_shown} nutrient(s) switched by hand.` : "Which nutrients the diary and the food editor show; the rest are still kept and can be switched on below."}
      >
        <div className="diet-inline">
          <Select label="Nutrition label" bare options={label_presets.map((preset): [string, string] => [preset.id, preset.label])} value={label_preset_of(settings).id} on_change={(id) => void set_setting("diet.label", id)} />
          {changed_shown > 0 && <button type="button" onClick={() => void set_setting("diet.shown", {})}>Reset to label</button>}
        </div>
      </SettingRow>
      <SettingRow
        label="Targets"
        hint={changed_targets.length ? `Custom: ${changed_targets.length} target(s) set by hand.` : "Which region's reference amounts each day is measured against; any target can be set by hand below."}
      >
        <div className="diet-inline">
          <Select label="Targets" bare options={target_presets.map((preset): [string, string] => [preset.id, preset.label])} value={target_preset_of(settings).id} on_change={(id) => void set_setting("diet.targets", id)} />
          {changed_targets.length > 0 && (
            <button type="button" onClick={() => void Promise.all(changed_targets.map((key) => set_setting(target_key(key), null)))}>Reset to preset</button>
          )}
        </div>
      </SettingRow>
    </>
  );
}

// One row per nutrient in a group: whether it shows, and its target, 0 meaning none.
export function NutrientSettings({ settings, set_setting, group }: FeatureSettingsProps & { group: NutrientGroup }) {
  const energy = energy_unit_of(settings);
  return (
    <>
      {nutrients.filter((info) => info.group === group).map((info) => {
        const unit = shown_unit(info, energy);
        const override = target_override(settings, info.key);
        const preset = preset_target(settings, info.key);
        const by_plan = target_source(settings, info.key) === "plan";
        const preset_text = preset > 0 ? format_nutrient(info, preset, energy) : "none";
        return (
          <SettingRow
            key={info.id}
            label={`${info.label} (${unit})`}
            hint={by_plan ? "Set by the plan on Calculators → Goals." : override === null ? undefined : `Set by hand; the preset's is ${preset_text}.`}
          >
            <div className="diet-inline">
              <Switch label={`Show ${info.label}`} checked={is_shown(settings, info)} on_change={(on) => set_setting("diet.shown", with_shown(settings, info, on))} />
              <NumberField
                label={`${info.label} target`}
                bare
                min={0}
                step={info.shown === "g" ? 5 : info.shown === "energy" ? 50 : 1}
                unit={unit}
                value={field_value(to_shown_value(info, target_of(settings, info.key), energy))}
                on_change={(shown) => void set_setting(target_key(info.key), to_stored_value(info, shown ?? 0, energy))}
              />
              {override !== null && !by_plan && <button type="button" aria-label={`Reset ${info.label} target`} onClick={() => void set_setting(target_key(info.key), null)}>Reset</button>}
            </div>
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
