// The Diet section: its tabs for the diary, trends, recipes, foods, grocery list, categories and units, and its own
// settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./diet.css";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading, Tabs } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { use_data, use_settings } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { CategoriesTab, UnitsTab } from "./CategoriesTab.tsx";
import { DataSettings, GrocerySettings, LookupSettings, TargetSettings } from "./DietSettings.tsx";
import { DiaryTab } from "./DiaryTab.tsx";
import { FoodsTab } from "./FoodsTab.tsx";
import { energy_unit_of } from "./format.ts";
import { GroceryTab } from "./GroceryTab.tsx";
import { RecipesTab } from "./RecipesTab.tsx";
import { TrendsTab } from "./TrendsTab.tsx";

// ── View ─────────────────────────────────────────────────────────────────────

const tabs = [
  { id: "diary", label: "Diary" },
  { id: "trends", label: "Trends" },
  { id: "recipes", label: "Recipes" },
  { id: "foods", label: "Foods" },
  { id: "grocery", label: "Grocery" },
  { id: "categories", label: "Categories" },
  { id: "units", label: "Units" },
] as const;

type TabId = (typeof tabs)[number]["id"];

// The route's parts after "diet": the tab, the diary when none.
export function DietView({ parts }: { parts: string[] }) {
  const tab: TabId = tabs.find((item) => item.id === parts[0])?.id ?? "diary";
  const data = use_data((api) => api.get_diet());
  const settings = use_settings();

  return (
    <div className="stack">
      <PageHeading title="Diet">
        <Tabs label="Diet sections" active={tab} items={tabs.map((item) => ({ ...item, href: `#/diet/${item.id}` }))} />
      </PageHeading>
      <Loaded resource={settings}>
        {(values) => {
          const energy = energy_unit_of(values);
          if (tab === "trends") return <TrendsTab settings={values} energy={energy} />;
          return (
            <Loaded resource={data}>
              {(diet) => (
                <>
                  {tab === "diary" && <DiaryTab data={diet} settings={values} energy={energy} />}
                  {tab === "recipes" && <RecipesTab data={diet} energy={energy} />}
                  {tab === "foods" && <FoodsTab data={diet} energy={energy} has_usda_key={String(values["diet.usda_api_key"] ?? "").trim() !== ""} />}
                  {tab === "grocery" && <GroceryTab data={diet} settings={values} />}
                  {tab === "categories" && <CategoriesTab data={diet} />}
                  {tab === "units" && <UnitsTab data={diet} />}
                </>
              )}
            </Loaded>
          );
        }}
      </Loaded>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function diet_settings(props: FeatureSettingsProps): SettingsSection[] {
  return [
    { id: "diet-targets", heading: "Daily targets", hint: "Each day's diary totals are measured against these. A target of 0 means no target.", content: <TargetSettings {...props} /> },
    { id: "diet-lookup", heading: "Food lookup", content: <LookupSettings {...props} /> },
    { id: "diet-grocery", heading: "Grocery", content: <GrocerySettings {...props} /> },
    { id: "diet-data", heading: "Import and export", content: <DataSettings /> },
  ];
}
