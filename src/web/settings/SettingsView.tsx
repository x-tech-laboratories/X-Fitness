// Settings: the units every section shows, each feature's own settings, sync with a server on a device, and backups.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

import { NumberField, Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { BackupSettings } from "@x-tech-laboratories/x-libs/web/react/backup_settings";
import { LocalMcpSettings } from "@x-tech-laboratories/x-libs/web/react/local_mcp_settings";
import { PageHeading, SettingRow, SettingsPage, type SettingsCategory, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { TrustedCertificates } from "@x-tech-laboratories/x-libs/web/react/certificates";
import { SyncSettings } from "@x-tech-laboratories/x-libs/web/react/sync_settings";

import { data_watch, page, set_setting, use_settings } from "../api.ts";
import { page_features } from "../features.tsx";

// ── Units ────────────────────────────────────────────────────────────────────

function units_section(settings: Record<string, unknown>, set_setting: (key: string, value: unknown) => Promise<void>): SettingsSection {
  const unit_row = (key: string, label: string, choices: [string, string]) => (
    <SettingRow label={label}>
      <Segmented label={label} choices={choices.map((unit) => ({ value: unit, label: unit }))} value={String(settings[key])} on_change={(unit) => void set_setting(key, unit)} />
    </SettingRow>
  );
  return {
    id: "units",
    heading: "Units",
    hint: "Everything is kept in metric and shown in the units chosen here.",
    content: (
      <>
        {unit_row("mass_unit", "Weight", ["kg", "lb"])}
        {unit_row("length_unit", "Length", ["cm", "in"])}
        {unit_row("distance_unit", "Distance", ["km", "mi"])}
        {unit_row("energy_unit", "Energy", ["kcal", "kJ"])}
        <SettingRow label="Week starts on">
          <Select
            label="Week starts on"
            bare
            options={[[1, "Monday"], [0, "Sunday"], [6, "Saturday"]]}
            value={Number(settings.week_start)}
            on_change={(day) => void set_setting("week_start", day)}
          />
        </SettingRow>
      </>
    ),
  };
}

// ── History ──────────────────────────────────────────────────────────────────

function history_section(settings: Record<string, unknown>, set_setting: (key: string, value: unknown) => Promise<void>): SettingsSection {
  return {
    id: "history",
    heading: "History",
    hint: "Every change to a workout, program, exercise, food, recipe, diary entry or body reading is kept, to look back on or restore under History.",
    content: (
      <SettingRow label="Keep changes for" hint="Older changes are pruned; each item always keeps its latest.">
        <NumberField label="Keep changes for" bare unit="days" min={1} value={Number(settings["history.keep_days"])} on_change={(days) => void set_setting("history.keep_days", days ?? 180)} />
      </SettingRow>
    ),
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

// A phone's backups wait for a folder it picks; the list is read again once one is, as the folder may already hold some.
function Backups() {
  const { backups, backup_folder } = page();
  const [folder_name, set_folder_name] = useState<string | null>(backup_folder ? null : "");
  useEffect(() => void backup_folder?.get().then(set_folder_name), [backup_folder]);
  if (!backups || folder_name === null) return null;

  const folder_row = backup_folder && (
    <SettingRow label="Backup folder" hint={folder_name || "Pick a folder in the phone's storage, such as Documents, where file managers and sync apps can reach the backups."}>
      <button type="button" onClick={() => void backup_folder.choose().then(set_folder_name)}>
        {folder_name ? "Change" : "Choose"}
      </button>
    </SettingRow>
  );
  return <BackupSettings key={folder_name} device={backups} data_name="fitness data" on_restored={() => data_watch.bump()} folder_row={folder_row} can_back_up={!backup_folder || folder_name !== ""} />;
}

// Sync on a device with its own database, and backups of whichever database the page works on.
function data_category(): SettingsCategory[] {
  const { device, backups, backup_folder, certificates, local_mcp } = page();
  const sections: SettingsSection[] = [
    ...(device ? [{ id: "sync", heading: "Sync", hint: "Keep this device's data alike with your X-Fitness server.", content: <>
      <SyncSettings device={device} certificates={certificates} subscribe={data_watch.subscribe} data_name="fitness data" placeholder="https://fitness.example.org/" />
      {certificates && <TrustedCertificates certificates={certificates} />}
    </> }] : []),
    ...(backups
      ? [{ id: "backups", heading: "Backups", hint: backup_folder ? "Copies of this device's data, kept in a folder you pick." : device ? "Copies of this device's data, kept beside it." : "Copies of the server's data, kept in its data folder. A restore restarts the server.", content: <Backups /> }]
      : []),
    ...(local_mcp
      ? [{ id: "mcp", heading: "MCP server", hint: "Let AI assistants such as Claude Code reach this device's data without the server.", content: <LocalMcpSettings device={local_mcp} name="x-fitness" data_name="read and change your workouts, diet and body readings" /> }]
      : []),
  ];
  return sections.length ? [{ heading: device ? "This device" : "Server", sections }] : [];
}

export function SettingsView() {
  const settings = use_settings();

  return (
    <>
      <PageHeading title="Settings" />
      <Loaded resource={settings}>
        {(values) => (
          <SettingsPage
            categories={[
              { heading: "General", sections: [units_section(values, set_setting), history_section(values, set_setting)] },
              ...page_features
                .map((feature) => ({ heading: feature.label, sections: feature.settings({ settings: values, set_setting }) }))
                .filter((category) => category.sections.length > 0),
              ...data_category(),
            ]}
          />
        )}
      </Loaded>
    </>
  );
}
