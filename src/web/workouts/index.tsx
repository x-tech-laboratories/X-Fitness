// The Workouts section: the log, programs, the exercise library, reports, the training calculators and categories as
// pages, and its own settings with the import from Liftosaur.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, type ChangeEvent } from "react";
import { describe_error } from "@x-tech-laboratories/x-libs/web/errors";
import { NumberField, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading, SettingRow, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { workout_setting_defaults } from "../../shared/workouts/settings.ts";
import type { WorkoutLibrary } from "../../shared/workouts/store.ts";
import { calls, use_data, use_settings } from "../api.ts";
import type { FeaturePage, FeatureSettingsProps } from "../features.tsx";
import { shown_units } from "../units.ts";
import { CategoriesTab } from "./CategoriesTab.tsx";
import { ExercisesTab } from "./ExercisesTab.tsx";
import { LogTab } from "./LogTab.tsx";
import { ProgramsTab } from "./ProgramsTab.tsx";
import { ReportsTab } from "./ReportsTab.tsx";
import { TrainingTab } from "./TrainingTab.tsx";
import "./workouts.css";

// ── View ─────────────────────────────────────────────────────────────────────

type TabId = "log" | "programs" | "exercises" | "reports" | "training" | "categories";

export const workouts_pages: (FeaturePage & { id: TabId })[] = [
  { id: "log", label: "Log" },
  { id: "programs", label: "Programs" },
  { id: "exercises", label: "Exercises" },
  { id: "reports", label: "Reports" },
  { id: "training", label: "Training" },
  { id: "categories", label: "Categories" },
];

function setting_number(settings: Record<string, unknown>, key: keyof typeof workout_setting_defaults): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : Number(workout_setting_defaults[key]);
}

// The route's parts after "workouts": the tab, such as "programs".
export function WorkoutsView({ parts }: { parts: string[] }) {
  const page = workouts_pages.find((item) => item.id === parts[0]) ?? workouts_pages[0]!;
  const tab = page.id;
  const library = use_data((api) => api.get_workout_library());
  const settings = use_settings();

  return (
    <>
      <PageHeading title={page.label} subtitle="Workouts" />
      <Loaded resource={library}>
        {(data) => (
          <Loaded resource={settings}>
            {(values) => <Stack>{tab_view(tab, data, values, parts.slice(1))}</Stack>}
          </Loaded>
        )}
      </Loaded>
    </>
  );
}

// One tab's page, given the library, the settings it reads and the route's parts after the tab.
function tab_view(tab: TabId, data: WorkoutLibrary, values: Record<string, unknown>, rest: string[]) {
  const units = shown_units(values);
  const default_rest = setting_number(values, "workouts.default_rest");
  if (tab === "programs") return <ProgramsTab library={data} units={units} default_rest={default_rest} />;
  if (tab === "exercises") return <ExercisesTab library={data} open_id={rest[0] && decodeURIComponent(rest[0])} />;
  if (tab === "reports") return <ReportsTab library={data} units={units} weekly_target={setting_number(values, "workouts.weekly_target")} week_start={Number(values.week_start ?? 1)} />;
  if (tab === "training") return <TrainingTab settings={values} units={units} />;
  if (tab === "categories") return <CategoriesTab />;
  return <LogTab library={data} units={units} default_rest={default_rest} rest_sound={values["workouts.rest_sound"] !== false} />;
}

// ── Settings ─────────────────────────────────────────────────────────────────

// Hands the picked file's text on, then clears the picker so the same file can be picked again.
async function read_picked(event: ChangeEvent<HTMLInputElement>): Promise<string | null> {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return null;
  const text = await file.text();
  input.value = "";
  return text;
}

function WorkoutData() {
  const liftosaur_file = useRef<HTMLInputElement>(null);

  async function import_liftosaur(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const summary = await calls().import_liftosaur_workouts(text);
      toast(
        `Imported ${summary.workouts} workout(s), ${summary.sets} set(s) and ${summary.exercises} exercise(s) from Liftosaur (skipped ${summary.warmup_sets} warmup and ${summary.incomplete_sets} unperformed set(s)).`,
        { tone: "good" },
      );
    } catch (error) {
      toast(`Could not import: ${describe_error(error)}`, { tone: "bad" });
    }
  }

  return (
    <SettingRow label="Import from Liftosaur" hint="The JSON backup or the history CSV; warmups and sets never performed are left out, and every weight is converted.">
      <input ref={liftosaur_file} type="file" accept="application/json,.json,text/csv,.csv" hidden aria-label="Liftosaur export file" onChange={(event) => void import_liftosaur(event)} />
      <button type="button" onClick={() => liftosaur_file.current?.click()}>
        Import Liftosaur…
      </button>
    </SettingRow>
  );
}

export function workouts_settings({ settings, set_setting }: FeatureSettingsProps): SettingsSection[] {
  return [
    {
      id: "workouts-training",
      heading: "Training",
      hint: "How sessions are planned and timed, and how many workouts a week you aim for.",
      content: (
        <>
          <SettingRow label="Default rest" hint="Seconds of rest a new session exercise starts with, and what the timer counts for an exercise added mid-workout.">
            <NumberField label="Default rest" bare unit="s" min={0} step={15} value={setting_number(settings, "workouts.default_rest")} on_change={(value) => void set_setting("workouts.default_rest", value ?? 0)} />
          </SettingRow>
          <SettingRow label="Rest timer chime" hint="Play a short chime when a rest timer runs out; the message shows either way.">
            <Switch label="Rest timer chime" checked={settings["workouts.rest_sound"] !== false} on_change={(on) => set_setting("workouts.rest_sound", on)} />
          </SettingRow>
          <SettingRow label="Workouts per week" hint="The target each week in Reports is measured against.">
            <NumberField label="Workouts per week" bare min={0} value={setting_number(settings, "workouts.weekly_target")} on_change={(value) => void set_setting("workouts.weekly_target", value ?? 0)} />
          </SettingRow>
        </>
      ),
    },
    {
      id: "workouts-data",
      heading: "Workout data",
      hint: "Bring workouts in from elsewhere.",
      content: <WorkoutData />,
    },
  ];
}
