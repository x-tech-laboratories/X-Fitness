// The Calculators section: its page for working numbers out, and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_settings } from "../api.ts";
import type { FeaturePage, FeatureSettingsProps } from "../features.tsx";
import { EnergySettings } from "../goals/GoalsTab.tsx";
import { shown_units } from "../units.ts";
import { CalculateTab } from "./CalculateTab.tsx";

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

export function calculators_settings({ settings, set_setting }: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "calculators",
      heading: "Calculators",
      hint: "The daily energy and the diet targets from the plan on Goals are worked out with these.",
      content: <EnergySettings settings={settings} set_setting={set_setting} />,
    },
  ];
}
