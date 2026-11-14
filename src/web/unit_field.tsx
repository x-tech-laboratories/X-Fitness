// A number field that shows a stored value in the unit shown, such as kilograms as pounds, and hands back what is typed
// as stored; 0 shows as an empty field unless asked otherwise, and leaving the field as it was changes nothing.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { FormRow, SettingRow } from "@x-tech-laboratories/x-libs/web/react/layout";

// ── Field ────────────────────────────────────────────────────────────────────

interface UnitNumberProps {
  label: string;
  // The value as stored, such as kilograms.
  value: number;
  on_change: (value: number) => void;
  // The stored value as shown and a shown one back as stored; the value as it is when left out.
  to_shown?: (value: number) => number;
  to_stored?: (shown: number) => number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  // Shows 0 as 0 instead of an empty field.
  show_zero?: boolean;
  // Sits in a FormRow with this id, or in a SettingRow, either with the hint; otherwise the field keeps its own label.
  form_row?: string;
  setting_row?: boolean;
  hint?: ReactNode;
  // Only the inputs, for a table cell or a row of controls.
  bare?: boolean;
}

export function UnitNumber({ label, value, on_change, to_shown = (stored) => stored, to_stored = (shown) => shown, unit, step, min, max, show_zero = false, form_row, setting_row = false, hint, bare = false }: UnitNumberProps) {
  const shown = value !== 0 || show_zero ? to_shown(value) : null;
  const field = (
    <NumberField
      bare={bare || form_row !== undefined || setting_row}
      label={label}
      value={shown}
      min={min}
      max={max}
      step={step}
      unit={unit}
      on_change={(next) => {
        if (next !== shown) on_change(next ? to_stored(next) : 0);
      }}
    />
  );
  if (form_row !== undefined) return <FormRow label={label} id={form_row} hint={hint}>{field}</FormRow>;
  if (setting_row) return <SettingRow label={label} hint={hint}>{field}</SettingRow>;
  return field;
}
