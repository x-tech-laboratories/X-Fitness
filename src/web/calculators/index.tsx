// The Calculators section: its pages for working numbers out and for goals from a plan, and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_settings } from "../api.ts";
import { shown_units } from "../body/format.ts";
import { energy_unit_of } from "../diet/format.ts";
import type { FeaturePage, FeatureSettingsProps } from "../features.tsx";
import { CalculateTab } from "./CalculateTab.tsx";
import { EnergySettings, GoalsTab } from "./GoalsTab.tsx";
import { TrainingTab } from "./TrainingTab.tsx";
import { units_of } from "../workouts/units.ts";

// ── View ─────────────────────────────────────────────────────────────────────

export const calculators_pages: FeaturePage[] = [
  { id: "calculate", label: "Calculators" },
  { id: "training", label: "Training" },
  { id: "goals", label: "Goals" },
];

// The route's parts after "calculators": the page, the calculators unless named.
export function CalculatorsView({ parts }: { parts: string[] }) {
  const settings = use_settings();
  const page = calculators_pages.find((item) => item.id === parts[0]) ?? calculators_pages[0]!;

  return (
    <>
      <PageHeading title={page.label} subtitle="Calculators" />
      <div className="stack">
        <Loaded resource={settings}>
          {(values) => {
            const units = shown_units(values);
            const energy = energy_unit_of(values);
            if (page.id === "goals") return <GoalsTab settings={values} units={units} energy={energy} />;
            if (page.id === "training") return <TrainingTab settings={values} units={units_of(values)} energy={energy} />;
            return <CalculateTab units={units} energy={energy} />;
          }}
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
      hint: "The daily energy and the diet targets from the plan on Calculators → Goals are worked out with these.",
      content: <EnergySettings settings={settings} set_setting={set_setting} />,
    },
  ];
}
