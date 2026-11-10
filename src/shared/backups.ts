// What every host's backups share: how they are named and how a saved schedule is read back.

// ── Imports ──────────────────────────────────────────────────────────────────

import { backup_naming, default_backup_schedule, type BackupSchedule } from "@x-tech-laboratories/x-libs/backups";

// ── Backups ──────────────────────────────────────────────────────────────────

// Names such as fitness-2026-11-10T09-30-00Z-auto.db.
export const fitness_backup_naming = backup_naming("fitness", ".db");

// A schedule saved on the device, the default where it is missing or damaged.
export function read_schedule(saved: unknown): BackupSchedule {
  const schedule = saved as Partial<BackupSchedule> | null;
  return {
    automatic: typeof schedule?.automatic === "boolean" ? schedule.automatic : default_backup_schedule.automatic,
    to_keep: typeof schedule?.to_keep === "number" && schedule.to_keep >= 0 ? Math.round(schedule.to_keep) : default_backup_schedule.to_keep,
  };
}
