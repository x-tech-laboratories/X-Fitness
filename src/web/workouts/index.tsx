// The Workouts section: the log, programs, the exercise library, reports and categories as tabs, and its own settings
// with the imports from the Trilium add-on and Liftosaur.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, type ChangeEvent } from "react";
import { NumberField, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import type { SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { PageHeading, SettingRow, Stack, Tabs } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { workout_setting_defaults, type WorkoutLibrary } from "../../shared/workouts/store.ts";
import { calls, use_data, use_settings } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";
import { CategoriesTab } from "./CategoriesTab.tsx";
import { ExercisesTab } from "./ExercisesTab.tsx";
import { LogTab } from "./LogTab.tsx";
import { ProgramsTab } from "./ProgramsTab.tsx";
import { ReportsTab } from "./ReportsTab.tsx";
import { units_of } from "./units.ts";
import "./workouts.css";

// ── View ─────────────────────────────────────────────────────────────────────

type TabId = "log" | "programs" | "exercises" | "reports" | "categories";

const tabs: { id: TabId; label: string }[] = [
  { id: "log", label: "Log" },
  { id: "programs", label: "Programs" },
  { id: "exercises", label: "Exercises" },
  { id: "reports", label: "Reports" },
  { id: "categories", label: "Categories" },
];

function setting_number(settings: Record<string, unknown>, key: keyof typeof workout_setting_defaults): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : Number(workout_setting_defaults[key]);
}

// The route's parts after "workouts": the tab, such as "programs".
export function WorkoutsView({ parts }: { parts: string[] }) {
  const tab = tabs.find((item) => item.id === parts[0])?.id ?? "log";
  const library = use_data((api) => api.get_workout_library());
  const settings = use_settings();

  return (
    <>
      <PageHeading title="Workouts">
        <Tabs label="Workouts" items={tabs.map((item) => ({ ...item, href: `#/workouts/${item.id}` }))} active={tab} />
      </PageHeading>
      <Loaded resource={library}>
        {(data) => (
          <Loaded resource={settings}>
            {(values) => <Stack>{tab_view(tab, data, values)}</Stack>}
          </Loaded>
        )}
      </Loaded>
    </>
  );
}

// One tab's page, given the library and the settings it reads.
function tab_view(tab: TabId, data: WorkoutLibrary, values: Record<string, unknown>) {
  const units = units_of(values);
  const default_rest = setting_number(values, "workouts.default_rest");
  if (tab === "programs") return <ProgramsTab library={data} units={units} default_rest={default_rest} />;
  if (tab === "exercises") return <ExercisesTab library={data} />;
  if (tab === "reports") return <ReportsTab library={data} units={units} weekly_target={setting_number(values, "workouts.weekly_target")} week_start={Number(values.week_start ?? 1)} />;
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

function failure_text(error: unknown): string {
  return `Could not import: ${error instanceof Error ? error.message : String(error)}`;
}

function WorkoutData({ settings }: { settings: Record<string, unknown> }) {
  const trilium_file = useRef<HTMLInputElement>(null);
  const liftosaur_file = useRef<HTMLInputElement>(null);
  const units = units_of(settings);

  async function import_trilium(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const text = await read_picked(event);
    if (text === null) return;
    try {
      const summary = await calls().import_trilium_workouts(text, { mass_unit: units.mass, distance_unit: units.distance });
      const skipped = summary.skipped_workouts > 0 ? ` ${summary.skipped_workouts} workout(s) were already here.` : "";
      toast(`Imported ${summary.exercises} exercise(s), ${summary.sessions} session(s) in ${summary.programs} new program(s) and ${summary.workouts} workout(s).${skipped}`, { tone: "good" });
    } catch (error) {
      toast(failure_text(error), { tone: "bad" });
    }
  }

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
      toast(failure_text(error), { tone: "bad" });
    }
  }

  async function export_all(): Promise<void> {
    const url = URL.createObjectURL(new Blob([await calls().export_workouts()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "x-fitness-workouts.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SettingRow label="Import from Trilium" hint={`The Workout Manager add-on's database.json, merged in by id; its numbers are read as ${units.mass} and ${units.distance}, the units set under Units.`}>
        <input ref={trilium_file} type="file" accept="application/json,.json" hidden aria-label="Trilium database file" onChange={(event) => void import_trilium(event)} />
        <button type="button" onClick={() => trilium_file.current?.click()}>
          Import Trilium…
        </button>
      </SettingRow>
      <SettingRow label="Import from Liftosaur" hint="The JSON backup or the history CSV; warmups and sets never performed are left out, and every weight is converted.">
        <input ref={liftosaur_file} type="file" accept="application/json,.json,text/csv,.csv" hidden aria-label="Liftosaur export file" onChange={(event) => void import_liftosaur(event)} />
        <button type="button" onClick={() => liftosaur_file.current?.click()}>
          Import Liftosaur…
        </button>
      </SettingRow>
      <SettingRow label="Export" hint="Every exercise, program and workout as one JSON file, in the Trilium add-on's shape, which Import Trilium reads back.">
        <button type="button" onClick={() => void export_all()}>
          Export JSON
        </button>
      </SettingRow>
    </>
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
      hint: "Bring workouts in from elsewhere, or take them all out as one file.",
      content: <WorkoutData settings={settings} />,
    },
  ];
}
