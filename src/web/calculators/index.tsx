// The Calculators section: its page for working numbers out, and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading, SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_settings } from "../api.ts";
import type { FeaturePage, FeatureSettingsProps } from "../features.tsx";
import type { BmrFormula } from "../../shared/calculators/formulas.ts";
import { shown_units } from "../units.ts";
import { CalculateTab } from "./CalculateTab.tsx";
import { bmr_formula_options } from "./options.ts";

// ── View ─────────────────────────────────────────────────────────────────────

export const calculators_pages: FeaturePage[] = [{ id: "calculate", label: "Calculators" }];

export function CalculatorsView() {
  const settings = use_settings();

  return (
    <>
      <PageHeading title="Calculators" />
      <div className="stack">
        <Loaded resource={settings}>
          {(values) => <CalculateTab units={shown_units(values)} />}
        </Loaded>
      </div>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

// The basal rate's formula and how far back the measured energy reads; activity and the energy source are on Goals.
function CalculatorSettings({ settings, set_setting }: FeatureSettingsProps) {
  return (
    <>
      <SettingRow label="BMR formula" hint="Katch-McArdle works from lean mass, so it needs a body fat; without one Mifflin-St Jeor is used.">
        <Select bare label="BMR formula" options={bmr_formula_options} value={String(settings["calculators.bmr_formula"]) as BmrFormula} on_change={(value) => void set_setting("calculators.bmr_formula", value)} />
      </SettingRow>
      <SettingRow label="Days measured over" hint="How far back the diary and the weight trend are read for the measured daily energy.">
        <NumberField bare label="Days measured over" value={Number(settings["calculators.measured_days"]) || 28} min={7} step={7} unit="days" on_change={(value) => value && void set_setting("calculators.measured_days", value)} />
      </SettingRow>
    </>
  );
}

export function calculators_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "calculators",
      heading: "Calculators",
      hint: "How the daily energy is worked out; the activity and whether it is measured from your log are set on Goals.",
      content: <CalculatorSettings {...props} />,
    },
  ];
}
