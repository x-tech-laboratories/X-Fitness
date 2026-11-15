// The Body section: its pages, and no settings of its own.

// ── Imports ──────────────────────────────────────────────────────────────────

import { lazy, Suspense } from "react";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import type { FeaturePage } from "../features.tsx";
import { use_settings } from "../api.ts";
import { shown_units } from "../units.ts";
import { MetricsTab } from "./MetricsTab.tsx";
import { PhotosTab } from "./PhotosTab.tsx";
import { YouCard } from "./YouCard.tsx";
import { ReportsTab } from "./ReportsTab.tsx";
import "./body.css";

// ── View ─────────────────────────────────────────────────────────────────────

// The 3D tab brings three.js with it, so it loads only when opened.
const ShapeTab = lazy(() => import("./ShapeTab.tsx").then((module) => ({ default: module.ShapeTab })));

type BodyTab = "reports" | "metrics" | "photos" | "shape";

export const body_pages: (FeaturePage & { id: BodyTab })[] = [
  { id: "reports", label: "Reports" },
  { id: "metrics", label: "Metrics" },
  { id: "photos", label: "Photos" },
  { id: "shape", label: "3D" },
];

// The route's parts after "body": the tab, Reports unless another is named, and the old #/body/log opens Metrics; then
// on Photos, a photo to open.
export function BodyView({ parts }: { parts: string[] }) {
  const settings = use_settings();
  const id = parts[0] === "log" ? "metrics" : parts[0];
  const page = body_pages.find((item) => item.id === id) ?? body_pages[0]!;
  const tab = page.id;

  return (
    <>
      <PageHeading title={page.label} subtitle="Body" />
      <div className="stack">
        <Loaded resource={settings}>
          {(values) => {
            const units = shown_units(values);
            if (tab === "metrics") return <><YouCard settings={values} /><MetricsTab units={units} /></>;
            if (tab === "photos") return <PhotosTab open_id={parts[1]} />;
            if (tab === "shape") return <Suspense fallback={<p className="muted">Loading…</p>}><ShapeTab units={units} settings={values} /></Suspense>;
            return <ReportsTab units={units} />;
          }}
        </Loaded>
      </div>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

// The height is a metric, sex and birth date are edited on Metrics and the 3D looks on the 3D tab, so Body has no section here.
export function body_settings(): SettingsSection[] {
  return [];
}
