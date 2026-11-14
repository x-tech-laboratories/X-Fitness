// The Goals section: a plan that sets the body metrics' goals and the diet's targets.

// ── Imports ──────────────────────────────────────────────────────────────────

import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_settings } from "../api.ts";
import type { FeaturePage } from "../features.tsx";
import { shown_units } from "../units.ts";
import { GoalsTab } from "./GoalsTab.tsx";

// ── View ─────────────────────────────────────────────────────────────────────

export const goals_pages: FeaturePage[] = [{ id: "plan", label: "Goals" }];

export function GoalsView() {
  const settings = use_settings();

  return (
    <>
      <PageHeading title="Goals" />
      <div className="stack">
        <Loaded resource={settings}>
          {(values) => <GoalsTab settings={values} units={shown_units(values)} />}
        </Loaded>
      </div>
    </>
  );
}
