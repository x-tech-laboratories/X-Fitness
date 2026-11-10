// Settings: the units every section shows, each feature's own settings, sync with a server on a device, and backups.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { BackupSettings } from "@x-tech-laboratories/x-libs/web/react/backup_settings";
import { PageHeading, SettingRow, SettingsPage, type SettingsCategory, type SettingsSection } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { SyncSettings } from "@x-tech-laboratories/x-libs/web/react/sync_settings";

import { calls, data_watch, page, use_settings } from "../api.ts";
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

// ── Page ─────────────────────────────────────────────────────────────────────

// Sync on a device with its own database, and backups of whichever database the page works on.
function data_category(): SettingsCategory[] {
  const { device, backups } = page();
  const sections: SettingsSection[] = [
    ...(device ? [{ id: "sync", heading: "Sync", hint: "Keep this device's data alike with your X-Fitness server.", content: <SyncSettings device={device} subscribe={data_watch.subscribe} data_name="fitness data" placeholder="https://fitness.example.org/" /> }] : []),
    ...(backups
      ? [{ id: "backups", heading: "Backups", hint: device ? "Copies of this device's data, kept beside it." : "Copies of the server's data, kept in its data folder.", content: <BackupSettings device={backups} data_name="fitness data" on_restored={() => data_watch.bump()} /> }]
      : []),
  ];
  return sections.length ? [{ heading: device ? "This device" : "Server", sections }] : [];
}

export function SettingsView() {
  const settings = use_settings();
  const set_setting = (key: string, value: unknown) => calls().set_setting(key, value);

  return (
    <>
      <PageHeading title="Settings" />
      <Loaded resource={settings}>
        {(values) => (
          <SettingsPage
            categories={[
              { heading: "General", sections: [units_section(values, set_setting)] },
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
