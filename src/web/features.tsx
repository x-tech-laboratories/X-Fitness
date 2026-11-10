// The sections of the app, each a feature's page with its own settings, in the order the sidebar lists them.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";

import { BodyView, body_pages, body_settings } from "./body/index.tsx";
import { DietView, diet_pages, diet_settings } from "./diet/index.tsx";
import { WorkoutsView, workouts_pages, workouts_settings } from "./workouts/index.tsx";

// ── Features ─────────────────────────────────────────────────────────────────

export interface FeatureSettingsProps {
  settings: Record<string, unknown>;
  set_setting: (key: string, value: unknown) => Promise<void>;
}

// One of a feature's pages, a row under it in the sidebar; the first is shown when none is named.
export interface FeaturePage {
  // The route's second part, such as "log" for #/workouts/log.
  id: string;
  label: string;
}

export interface PageFeature {
  // The route's first part, such as "workouts" for #/workouts.
  id: string;
  label: string;
  pages: FeaturePage[];
  view: (parts: string[]) => ReactNode;
  settings: (props: FeatureSettingsProps) => SettingsSection[];
}

export const page_features: PageFeature[] = [
  { id: "workouts", label: "Workouts", pages: workouts_pages, view: (parts) => <WorkoutsView parts={parts} />, settings: workouts_settings },
  { id: "diet", label: "Diet", pages: [...diet_pages], view: (parts) => <DietView parts={parts} />, settings: diet_settings },
  { id: "body", label: "Body", pages: body_pages, view: (parts) => <BodyView parts={parts} />, settings: body_settings },
];
