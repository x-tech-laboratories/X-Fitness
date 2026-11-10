// Controls any app could use, kept here until X-Libs has them: a text field that offers known values the moment it is
// clicked, and a select whose options sit in groups.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useId, useMemo, useState, type KeyboardEvent } from "react";

// ── Combo input ──────────────────────────────────────────────────────────────

interface ComboInputProps {
  label: string;
  value: string;
  // Offered in full on focus or click, narrowed as the text is typed; anything else can still be typed.
  suggestions: string[];
  on_change: (value: string) => void;
  // A suggestion taken from the list; on_change when not given.
  on_pick?: (value: string) => void;
  // Enter with no suggestion lit, such as to add what was typed.
  on_enter?: () => void;
  on_blur?: () => void;
  placeholder?: string;
  id?: string;
}

export function ComboInput({ label, value, suggestions, on_change, on_pick, on_enter, on_blur, placeholder, id }: ComboInputProps) {
  const list_id = useId();
  const [open, set_open] = useState(false);
  const [index, set_index] = useState(-1);

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    return needle ? suggestions.filter((suggestion) => suggestion.toLowerCase().includes(needle)) : suggestions;
  }, [suggestions, value]);
  const shown = open && matches.length > 0;

  function take(suggestion: string): void {
    (on_pick ?? on_change)(suggestion);
    set_open(false);
    set_index(-1);
  }

  function keyed(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!shown) return set_open(true);
      // Past either end comes back to the typed text, lit as -1.
      const next = index + (event.key === "ArrowDown" ? 1 : -1);
      set_index(next >= matches.length ? -1 : next < -1 ? matches.length - 1 : next);
    } else if (event.key === "Enter") {
      const lit = shown ? matches[index] : undefined;
      if (lit === undefined && !on_enter) return;
      event.preventDefault();
      if (lit !== undefined) take(lit);
      else {
        set_open(false);
        on_enter?.();
      }
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      set_open(false);
    }
  }

  const option_id = (position: number) => `${list_id}-${position}`;
  return (
    <div className="suggest-wrap">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={list_id}
        aria-activedescendant={shown && index >= 0 ? option_id(index) : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          on_change(event.currentTarget.value);
          set_open(true);
          set_index(-1);
        }}
        onFocus={() => set_open(true)}
        onClick={() => set_open(true)}
        onBlur={() => {
          set_open(false);
          on_blur?.();
        }}
        onKeyDown={keyed}
      />
      {shown && (
        <ul id={list_id} className="suggestions menu" role="listbox" aria-label={label}>
          {matches.map((suggestion, position) => (
            <li
              key={suggestion}
              id={option_id(position)}
              role="option"
              className="menu-item"
              aria-selected={position === index}
              onMouseDown={(event) => {
                event.preventDefault();
                take(suggestion);
              }}
            >
              <span className="suggestion-main">{suggestion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Grouped select ───────────────────────────────────────────────────────────

export interface OptionGroup {
  label: string;
  options: [value: string, text: string][];
}

interface GroupedSelectProps {
  label: string;
  groups: OptionGroup[];
  value: string;
  // The first option, chosen while nothing is; the empty value.
  placeholder: string;
  on_change: (value: string) => void;
  id?: string;
}

export function GroupedSelect({ label, groups, value, placeholder, on_change, id }: GroupedSelectProps) {
  return (
    <select id={id} aria-label={label} value={value} onChange={(event) => on_change(event.currentTarget.value)}>
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map(([option, text]) => (
            <option key={option} value={option}>
              {text}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
