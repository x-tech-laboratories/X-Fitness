// The Diet section's settings: the nutrition label and target presets, each nutrient's switch and target, the USDA key for food lookup, and the grocery comment prefill.

// ── Imports ──────────────────────────────────────────────────────────────────

import { CommitInput, NumberField, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { moved, RowActions, SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";

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
import { normalize_meals, nutrient_keys, nutrients, target_key, type Meal, type NutrientGroup } from "../../shared/diet/model.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { shown_units } from "../units.ts";
import { field_value, format_amount, format_nutrient, shown_unit, to_shown_value, to_stored_value } from "./format.ts";

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
        <div className="inline-row">
          <Select label="Nutrition label" bare options={label_presets.map((preset): [string, string] => [preset.id, preset.label])} value={label_preset_of(settings).id} on_change={(id) => void set_setting("diet.label", id)} />
          {changed_shown > 0 && <button type="button" onClick={() => void set_setting("diet.shown", {})}>Reset to label</button>}
        </div>
      </SettingRow>
      <SettingRow
        label="Targets"
        hint={changed_targets.length ? `Custom: ${changed_targets.length} target(s) set by hand.` : "Which region's reference amounts each day is measured against; any target can be set by hand below."}
      >
        <div className="inline-row">
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
  const energy = shown_units(settings).energy;
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
            hint={by_plan ? "Set by the plan on Goals." : override === null ? undefined : `Set by hand; the preset's is ${preset_text}.`}
          >
            <div className="diet-target">
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
              {override !== null && !by_plan ? (
                <button type="button" aria-label={`Reset ${info.label} target`} onClick={() => void set_setting(target_key(info.key), null)}>Reset</button>
              ) : (
                <span />
              )}
            </div>
          </SettingRow>
        );
      })}
    </>
  );
}

// ── Meals ────────────────────────────────────────────────────────────────────

// The meals in order, each with the time a new entry starts falling in it and its share of the energy target; an entry
// in a meal removed goes by the time it was logged.
export function MealSettings({ settings, set_setting }: FeatureSettingsProps) {
  const meals = normalize_meals(settings["diet.meals"]);
  const save = (next: Meal[]) => void set_setting("diet.meals", next);
  const change = (index: number, changes: Partial<Meal>) => save(meals.map((meal, position) => (position === index ? { ...meal, ...changes } : meal)));
  const shares = meals.reduce((sum, meal) => sum + meal.share, 0);
  return (
    <>
      {meals.map((meal, index) => (
        <SettingRow key={meal.id} label={meal.name} hint={meal.start ? `New entries from ${meal.start} fall in it.` : "Only picked by hand."}>
          <div className="inline-row">
            <CommitInput
              aria-label={`${meal.name} name`}
              value={meal.name}
              on_commit={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== meal.name) change(index, { name });
              }}
            />
            <CommitInput aria-label={`${meal.name} starts at`} type="time" value={meal.start} on_commit={(event) => change(index, { start: event.currentTarget.value })} />
            <NumberField label={`${meal.name} share`} bare min={0} max={100} step={5} unit="%" value={meal.share} on_change={(share) => change(index, { share: share ?? 0 })} />
            <RowActions
              index={index}
              count={meals.length}
              on_move={(from, to) => save(moved(meals, from, to))}
              on_remove={meals.length > 1 ? () => save(meals.filter((_, position) => position !== index)) : undefined}
              remove_label={`Remove ${meal.name}`}
            />
          </div>
        </SettingRow>
      ))}
      <SettingRow label="Add a meal" hint={`The shares add up to ${format_amount(shares)}% of the day's energy target.`}>
        <button type="button" onClick={() => save([...meals, { id: crypto.randomUUID(), name: `Meal ${meals.length + 1}`, start: "", share: 0 }])}>Add meal</button>
      </SettingRow>
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
