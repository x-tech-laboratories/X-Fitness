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
import { YouCard } from "./YouCard.tsx";
import { ReportsTab } from "./ReportsTab.tsx";
import "./body.css";

// ── View ─────────────────────────────────────────────────────────────────────

// The 3D tab brings three.js with it, so it loads only when opened.
const ShapeTab = lazy(() => import("./ShapeTab.tsx").then((module) => ({ default: module.ShapeTab })));

type BodyTab = "metrics" | "reports" | "shape";

export const body_pages: (FeaturePage & { id: BodyTab })[] = [
  { id: "metrics", label: "Metrics" },
  { id: "reports", label: "Reports" },
  { id: "shape", label: "3D" },
];

// The route's parts after "body": the tab, Metrics unless another is named, so the old #/body/log opens Metrics too.
export function BodyView({ parts }: { parts: string[] }) {
  const settings = use_settings();
  const page = body_pages.find((item) => item.id === parts[0]) ?? body_pages[0]!;
  const tab = page.id;

  return (
    <>
      <PageHeading title={page.label} subtitle="Body" />
      <div className="stack">
        <Loaded resource={settings}>
          {(values) => {
            const units = shown_units(values);
            if (tab === "reports") return <ReportsTab units={units} />;
            if (tab === "shape") return <Suspense fallback={<p className="muted">Loading…</p>}><ShapeTab units={units} settings={values} /></Suspense>;
            return <><YouCard settings={values} /><MetricsTab units={units} /></>;
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
