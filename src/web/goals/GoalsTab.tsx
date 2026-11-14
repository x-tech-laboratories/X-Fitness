// The Goals page in three parts: where I am now, from the latest readings; where I want to be, the body metrics'
// goals; and how I get there, the plan with the diet's daily targets it gives and when the goal weight is reached.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_data } from "../api.ts";
import type { ShownUnits } from "../units.ts";
import { GoalsSection } from "./GoalsSection.tsx";
import { NowSection } from "./NowSection.tsx";
import { PlanSection } from "./PlanSection.tsx";

// ── Tab ──────────────────────────────────────────────────────────────────────

export function GoalsTab({ settings, units }: { settings: Record<string, unknown>; units: ShownUnits }) {
  const report = use_data((api) => api.get_calculations(today()));

  return (
    <Loaded resource={report}>
      {(loaded) => (
        <div className="stack">
          <NowSection report={loaded} units={units} />
          <GoalsSection report={loaded} units={units} />
          <PlanSection report={loaded} settings={settings} units={units} />
        </div>
      )}
    </Loaded>
  );
}
