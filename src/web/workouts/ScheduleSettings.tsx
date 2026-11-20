// The training schedule under Settings → Workouts: the program followed and the days its sessions come round on, in turn.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { CommitInput, Select, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { RecurrenceField } from "@x-tech-laboratories/x-libs/web/react/recurrence";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import type { TrainingSchedule } from "../../shared/schedule/model.ts";
import { schedule_setting_defaults } from "../../shared/schedule/settings.ts";
import { workout_setting_defaults } from "../../shared/workouts/settings.ts";
import { use_data } from "../api.ts";
import type { FeatureSettingsProps } from "../features.tsx";

// ── Section ──────────────────────────────────────────────────────────────────

function schedule_of(settings: Record<string, unknown>): TrainingSchedule {
  return { ...workout_setting_defaults["workouts.schedule"], ...(settings["workouts.schedule"] as Partial<TrainingSchedule> | undefined) };
}

export function ScheduleSettings({ settings, set_setting }: FeatureSettingsProps) {
  const library = use_data((api) => api.get_workout_library());
  const schedule = schedule_of(settings);
  const save = (change: Partial<TrainingSchedule>) => void set_setting("workouts.schedule", { ...schedule, ...change });
  return (
    <Loaded resource={library}>
      {(data) => {
        const options: [string, string][] = [["", "None"], ...data.programs.map((program): [string, string] => [program.id, program.name])];
        return (
          <>
            <SettingRow label="Program you follow" hint="Its sessions come next in turn on the Overview, after the last one logged.">
              <Select bare label="Program you follow" options={options} value={options.some(([id]) => id === schedule.program) ? schedule.program : ""} on_change={(program) => save({ program })} />
            </SettingRow>
            <SettingRow label="Training days" hint="When the next session is due; give a time of day, or leave it out to have the whole day.">
              <RecurrenceField
                label="Training days"
                features="simple times"
                time_mode="floating"
                start={schedule.start || today()}
                value={schedule.rule}
                on_change={(rule) => save({ rule, start: today() })}
              />
            </SettingRow>
            <TrainingReminders settings={settings} set_setting={set_setting} />
          </>
        );
      }}
    </Loaded>
  );
}

// ── Reminders ────────────────────────────────────────────────────────────────

function TrainingReminders({ settings, set_setting }: FeatureSettingsProps) {
  const is_on = (settings["schedule.remind_training"] ?? schedule_setting_defaults["schedule.remind_training"]) === true;
  const time = String(settings["schedule.training_day_time"] ?? schedule_setting_defaults["schedule.training_day_time"]);
  return (
    <>
      <SettingRow label="Remind me to train" hint="The desktop and Android apps show a notification as each training day's session comes due, even when closed." as_label>
        <Switch label="Remind me to train" checked={is_on} on_change={(on) => void set_setting("schedule.remind_training", on)} />
      </SettingRow>
      <SettingRow label="Reminder time on training days" hint="When a training day without a time of its own is reminded of.">
        <CommitInput aria-label="Reminder time on training days" type="time" value={time} disabled={!is_on} on_commit={(event) => event.currentTarget.value && void set_setting("schedule.training_day_time", event.currentTarget.value)} />
      </SettingRow>
    </>
  );
}
