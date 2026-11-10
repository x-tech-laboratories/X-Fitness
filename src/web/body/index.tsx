// The Body section: its page and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";

import type { FeatureSettingsProps } from "../features.tsx";

// ── View ─────────────────────────────────────────────────────────────────────

// The route's parts after "body", such as an item's id.
export function BodyView({ parts }: { parts: string[] }) {
  return (
    <>
      <PageHeading title="Body" />
      <p className="placeholder" data-parts={parts.join("/")}>Track weight, body fat, girths and any measure of your own over time.</p>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function body_settings(_props: FeatureSettingsProps): SettingsSection[] {
  return [];
}
