// The Diet section: its pages for the diary, trends, recipes, foods, grocery list, categories and units, and its own
// settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import "./diet.css";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { shown_nutrients } from "../../shared/diet/labels.ts";
import { nutrient_groups } from "../../shared/diet/model.ts";
import { use_data, use_settings } from "../api.ts";
import type { FeaturePage, FeatureSettingsProps } from "../features.tsx";
import { CategoriesTab, UnitsTab } from "./CategoriesTab.tsx";
import { GrocerySettings, LabelSettings, LookupSettings, MealSettings, NutrientSettings } from "./DietSettings.tsx";
import { DiaryTab } from "./DiaryTab.tsx";
import { FoodsTab } from "./FoodsTab.tsx";
import { energy_unit_of } from "./format.ts";
import { GroceryTab } from "./GroceryTab.tsx";
import { RecipesTab } from "./RecipesTab.tsx";
import { TrendsTab } from "./TrendsTab.tsx";

// ── View ─────────────────────────────────────────────────────────────────────

export const diet_pages = [
  { id: "diary", label: "Diary" },
  { id: "trends", label: "Trends" },
  { id: "recipes", label: "Recipes" },
  { id: "foods", label: "Foods" },
  { id: "grocery", label: "Grocery" },
  { id: "categories", label: "Categories" },
  { id: "units", label: "Units" },
] as const satisfies readonly FeaturePage[];

type TabId = (typeof diet_pages)[number]["id"];

// The route's parts after "diet": the tab, the diary when none.
export function DietView({ parts }: { parts: string[] }) {
  const page = diet_pages.find((item) => item.id === parts[0]) ?? diet_pages[0];
  const tab: TabId = page.id;
  const data = use_data((api) => api.get_diet());
  const settings = use_settings();

  return (
    <div className="stack">
      <PageHeading title={page.label} subtitle="Diet" />
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
                  {tab === "foods" && <FoodsTab data={diet} energy={energy} shown={shown_nutrients(values)} has_usda_key={String(values["diet.usda_api_key"] ?? "").trim() !== ""} />}
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
    { id: "diet-label", heading: "Nutrition label and targets", content: <LabelSettings {...props} /> },
    {
      id: "diet-meals",
      heading: "Meals",
      hint: "Each diary entry falls in a meal, picked by the time it is logged and changeable on the entry. A meal's share sets its part of the day's energy target.",
      content: <MealSettings {...props} />,
    },
    ...nutrient_groups.map((group) => ({
      id: `diet-nutrients-${group.id}`,
      heading: group.label,
      hint:
        group.id !== "macros"
          ? undefined
          : props.settings["calculators.follow_diet_targets"] === true
            ? "Switch a nutrient on to show it in the diary and the food editor. Calories, protein, fat and carbs follow the plan on Goals, which sets them again after every change; the rest follow the preset unless set by hand."
            : "Switch a nutrient on to show it in the diary and the food editor. A target of 0 means none; Reset goes back to the preset's.",
      content: <NutrientSettings {...props} group={group.id} />,
    })),
    { id: "diet-lookup", heading: "Food lookup", content: <LookupSettings {...props} /> },
    { id: "diet-grocery", heading: "Grocery", content: <GrocerySettings {...props} /> },
  ];
}
