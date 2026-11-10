// The Diet section: its page and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { FeatureSettingsProps } from "../features.tsx";

// ── View ─────────────────────────────────────────────────────────────────────

// The route's parts after "diet", such as an item's id.
export function DietView({ parts }: { parts: string[] }) {
  return (
    <>
      <PageHeading title="Diet" />
      <p className="placeholder" data-parts={parts.join("/")}>Log foods and meals against the day's calorie and nutrient targets.</p>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function diet_settings(_props: FeatureSettingsProps): SettingsSection[] {
  return [];
}
