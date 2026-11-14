// Days as the charts take them: a logged day as seconds since 1970 and back, read in UTC so a time zone never moves them.

// ── Charts ───────────────────────────────────────────────────────────────────

// A day such as "2026-11-10" as the epoch seconds a chart point takes.
export function epoch_of(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 1000;
}

// A chart point's epoch seconds as the day it was logged.
export function day_of(epoch: number): string {
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}
