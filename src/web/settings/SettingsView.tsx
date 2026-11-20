// Settings: the units every section shows, each feature's own settings, the daemons the desktop connects to, sync with a
// server on a device, backups, and the desktop app's tray and background running.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

import { NumberField, Segmented, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { BackupSettings } from "@x-tech-laboratories/x-libs/web/react/backup_settings";
import { ConnectionSettings } from "@x-tech-laboratories/x-libs/web/react/connections";
import { LocalMcpSettings } from "@x-tech-laboratories/x-libs/web/react/local_mcp_settings";
import { PageHeading, SettingRow, SettingsPage, type SettingsCategory, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { TrustedCertificates } from "@x-tech-laboratories/x-libs/web/react/certificates";
import { SyncSettings } from "@x-tech-laboratories/x-libs/web/react/sync_settings";

import type { DesktopSettings } from "../../shared/desktop.ts";
import { data_watch, page, set_setting, show_error, use_settings } from "../api.ts";
import { page_features } from "../features.tsx";
import { shown_units } from "../units.ts";

// ── Units ────────────────────────────────────────────────────────────────────

function units_section(settings: Record<string, unknown>, set_setting: (key: string, value: unknown) => Promise<void>): SettingsSection {
  const unit_row = (key: string, label: string, choices: [string, string], value = settings[key]) => (
    <SettingRow label={label}>
      <Segmented label={label} choices={choices.map((unit) => ({ value: unit, label: unit }))} value={String(value)} on_change={(unit) => void set_setting(key, unit)} />
    </SettingRow>
  );
  return {
    id: "units",
    heading: "Units",
    hint: "Everything is kept in metric and shown in the units chosen here.",
    content: (
      <>
        {unit_row("mass_unit", "Body weight", ["kg", "lb"])}
        {unit_row("workouts.mass_unit", "Workout weight", ["kg", "lb"], shown_units(settings).lifted)}
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

// The desktop app's own settings, which belong to this computer and do not sync.
function Desktop() {
  const { desktop } = page();
  const [settings, set_settings] = useState<DesktopSettings | null>(null);
  useEffect(() => void desktop?.get_desktop_settings().then(set_settings, show_error), [desktop]);
  if (!desktop || !settings) return null;

  const change = (key: keyof DesktopSettings, on: boolean): void => {
    set_settings({ ...settings, [key]: on });
    void desktop.set_desktop_setting(key, on).catch(show_error);
  };
  return (
    <>
      <SettingRow label="Show tray icon" hint="An icon in the system tray shows the workout under way with its time, finishes it, lists what comes next, and brings the window back." as_label>
        <Switch label="Show tray icon" checked={settings.show_tray_icon} on_change={(on) => change("show_tray_icon", on)} />
      </SettingRow>
      <SettingRow label="Keep running in the background" hint="Sync, backups and the MCP server carry on with the window closed. Turned off, they stop shortly after the last window closes." as_label>
        <Switch label="Keep running in the background" checked={settings.keep_running_in_background} on_change={(on) => change("keep_running_in_background", on)} />
      </SettingRow>
      <SettingRow label="Start at login" hint="Starts X-Fitness in the background when you log in, without opening its window." as_label>
        <Switch label="Start at login" checked={settings.start_at_login} disabled={!settings.keep_running_in_background} on_change={(on) => change("start_at_login", on)} />
      </SettingRow>
      <SettingRow label="Quit completely" hint="Closes the window and stops X-Fitness in the background too, until you open it again.">
        <button type="button" onClick={() => void desktop.quit_completely().catch(show_error)}>Quit completely</button>
      </SettingRow>
    </>
  );
}

// Sync on a device with its own database, and backups of whichever database the page works on.
function data_category(): SettingsCategory[] {
  const { device, backups, backup_folder, certificates, local_mcp, desktop, connections, connection_certificates } = page();
  const sections: SettingsSection[] = [
    ...(connections ? [{ id: "connections", heading: "Connections", hint: "The X-Fitness daemon this app works on: this computer's own, which keeps working offline and syncs, or one on another computer such as your server.", content: <>
      <ConnectionSettings client={connections} certificates={connection_certificates} placeholder="https://fitness.example.org" />
      {connection_certificates && <TrustedCertificates certificates={connection_certificates} />}
    </> }] : []),
    ...(device ? [{ id: "sync", heading: "Sync", hint: "Keep this daemon's data alike with your X-Fitness server.", content: <>
      <SyncSettings device={device} certificates={certificates} subscribe={data_watch.subscribe} data_name="fitness data" placeholder="https://fitness.example.org/" />
      {certificates && <TrustedCertificates certificates={certificates} />}
    </> }] : []),
    ...(backups
      ? [{ id: "backups", heading: "Backups", hint: backup_folder ? "Copies of this device's data, kept in a folder you pick." : device ? "Copies of this device's data, kept beside it." : "Copies of the server's data, kept in its data folder. A restore restarts the server.", content: <Backups /> }]
      : []),
    ...(local_mcp
      ? [{ id: "mcp", heading: "MCP server", hint: "Let AI assistants such as Claude Code on the same computer reach this daemon's data without a token.", content: <LocalMcpSettings device={local_mcp} name="x-fitness" data_name="read and change your workouts, diet and body readings" /> }]
      : []),
    ...(desktop ? [{ id: "desktop", heading: "Desktop", hint: "The tray icon, and what runs while the window is closed.", content: <Desktop /> }] : []),
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
