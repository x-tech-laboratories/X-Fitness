// The Body section: its page and its own settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading, Tabs } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import type { FeatureSettingsProps } from "../features.tsx";
import { use_settings } from "../api.ts";
import { BodyData, HeightSetting } from "./BodySettings.tsx";
import { shown_units } from "./format.ts";
import { LogTab } from "./LogTab.tsx";
import { MetricsTab } from "./MetricsTab.tsx";
import { ReportsTab } from "./ReportsTab.tsx";
import "./body.css";

// ── View ─────────────────────────────────────────────────────────────────────

type BodyTab = "log" | "reports" | "metrics";

const tabs: { id: BodyTab; label: string; href: string }[] = [
  { id: "log", label: "Log", href: "#/body/log" },
  { id: "reports", label: "Reports", href: "#/body/reports" },
  { id: "metrics", label: "Metrics", href: "#/body/metrics" },
];

// The route's parts after "body": the tab, Log unless named.
export function BodyView({ parts }: { parts: string[] }) {
  const settings = use_settings();
  const tab = tabs.find((item) => item.id === parts[0])?.id ?? "log";

  return (
    <>
      <PageHeading title="Body" subtitle="Weight, body fat, girths and any measure of your own, against your goals." />
      <div className="stack">
        <Tabs label="Body" items={tabs} active={tab} />
        <Loaded resource={settings}>
          {(values) => {
            const units = shown_units(values);
            if (tab === "reports") return <ReportsTab units={units} />;
            if (tab === "metrics") return <MetricsTab units={units} />;
            return <LogTab units={units} />;
          }}
        </Loaded>
      </div>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function body_settings({ settings, set_setting }: FeatureSettingsProps): SettingsSection[] {
  const units = shown_units(settings);
  return [
    {
      id: "body",
      heading: "Body",
      hint: "Weights and lengths follow the units under General.",
      content: <HeightSetting height={Number(settings["body.height"]) || 0} units={units} set_setting={set_setting} />,
    },
    {
      id: "body-data",
      heading: "Body data",
      hint: "Importing merges: metrics not here are added, and on a day both hold, the readings here are kept. Importing a file twice changes nothing.",
      content: <BodyData units={units} />,
    },
  ];
}
