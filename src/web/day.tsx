// The day a page shows, today to begin with, and the stepper that moves it a day at a time.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { is_day, today } from "@x-tech-laboratories/x-libs/dates";
import { PeriodStepper } from "@x-tech-laboratories/x-libs/web/react/controls";
import { read_pref, write_pref } from "@x-tech-laboratories/x-libs/web/prefs";

// ── Day ──────────────────────────────────────────────────────────────────────

// This tab's session storage, or nothing where there is none or it may not be touched.
function session_storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

interface DayOptions {
  // The day shown first; today unless set.
  initial?: string;
  // Keeps the day under this key for the tab's session, so it survives a visit elsewhere and starts at today next time.
  remember?: string;
}

export function use_day({ initial, remember }: DayOptions = {}): [day: string, set_day: (day: string) => void] {
  const [day, set_state] = useState(() => {
    const first = initial ?? today();
    return remember ? read_pref(session_storage(), remember, first, is_day) : first;
  });
  function set_day(next: string): void {
    set_state(next);
    if (remember) write_pref(session_storage(), remember, next);
  }
  return [day, set_day];
}

export function DayStepper({ day, on_change }: { day: string; on_change: (day: string) => void }) {
  return <PeriodStepper label="Day" period="day" value={day} on_change={on_change} />;
}
