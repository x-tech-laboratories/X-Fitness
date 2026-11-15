// The training schedule under Settings → Workouts: the program followed and the days its sessions come round on, in turn.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";
import { RecurrenceField } from "@x-tech-laboratories/x-libs/web/react/recurrence";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import type { TrainingSchedule } from "../../shared/schedule/model.ts";
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
          </>
        );
      }}
    </Loaded>
  );
}
