// The Workouts section: its page and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { FeatureSettingsProps } from "../features.tsx";

// ── View ─────────────────────────────────────────────────────────────────────

// The route's parts after "workouts", such as an item's id.
export function WorkoutsView({ parts }: { parts: string[] }) {
  return (
    <>
      <PageHeading title="Workouts" />
      <p className="placeholder" data-parts={parts.join("/")}>Log sessions and sets, follow routines, and see progress per exercise.</p>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function workouts_settings(_props: FeatureSettingsProps): SettingsSection[] {
  return [];
}
