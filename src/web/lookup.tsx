// A search of an online database above a form: a search box, what went wrong, and the results, one of which is picked to
// fill the form in; nothing is saved until the form is.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { describe_error } from "@x-tech-laboratories/x-libs/web/errors";
import { SearchBox } from "@x-tech-laboratories/x-libs/web/react/controls";

// ── Panel ────────────────────────────────────────────────────────────────────

// What a search found, and a line per source that failed while the others still answered.
export interface LookupFound<Result> {
  results: Result[];
  errors?: string[];
}

interface LookupPanelProps<Result> {
  // The search box's label, such as "Search Open Food Facts".
  label: string;
  // The results list's label.
  results_label: string;
  search: (query: string) => Promise<LookupFound<Result>>;
  // What a failed search says, given why it failed.
  failure_text?: (reason: string) => string;
  empty_text: string;
  key_of: (result: Result) => string | number;
  // A result's row, given the function that picks it.
  row: (result: Result, pick: () => void) => ReactNode;
  on_pick: (result: Result) => void;
  // A word under the search box, such as what more could be searched.
  children?: ReactNode;
  class_name?: string;
}

export function LookupPanel<Result>({ label, results_label, search, failure_text = (reason) => reason, empty_text, key_of, row, on_pick, children, class_name = "stack tight" }: LookupPanelProps<Result>) {
  const [found, set_found] = useState<LookupFound<Result> | null>(null);
  const [searching, set_searching] = useState(false);
  const [failure, set_failure] = useState("");

  async function run(query: string): Promise<void> {
    if (!query.trim()) return set_found(null);
    set_searching(true);
    set_failure("");
    try {
      set_found(await search(query));
    } catch (error) {
      set_failure(failure_text(describe_error(error)));
      set_found(null);
    } finally {
      set_searching(false);
    }
  }

  const errors = [failure, ...(found?.errors ?? [])].filter(Boolean);
  return (
    <div className={class_name}>
      <SearchBox label={label} value="" submit_label="Search" on_submit={(query) => void run(query)} />
      {children}
      {searching && (
        <p className="muted" role="status">
          Searching…
        </p>
      )}
      {errors.map((error) => (
        <p key={error} className="tone-bad" role="alert">
          {error}
        </p>
      ))}
      {found && !searching && found.results.length === 0 && <p className="muted small">{empty_text}</p>}
      {found && !searching && found.results.length > 0 && (
        <ul className="plain-list result-list" aria-label={results_label}>
          {found.results.map((result) => (
            <li key={key_of(result)}>
              {row(result, () => {
                on_pick(result);
                set_found(null);
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
