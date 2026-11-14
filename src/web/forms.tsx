// The small form pieces the lists share: a toolbar form that adds an item by name, a name renamed in place, and the
// Save and Cancel buttons under a form or a dialog.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState, type KeyboardEvent } from "react";

// ── Adding ───────────────────────────────────────────────────────────────────

interface AddNameFormProps {
  // The field's label and placeholder, such as "New program".
  label: string;
  // The button's text, such as "Add Program".
  button: string;
  // Gives false when adding failed, so the name stays typed.
  on_add: (name: string) => Promise<boolean>;
  class_name?: string;
}

// A name typed into a toolbar and added with its button or Enter.
export function AddNameForm({ label, button, on_add, class_name = "toolbar" }: AddNameFormProps) {
  const [draft, set_draft] = useState("");
  return (
    <form
      className={class_name}
      onSubmit={(event) => {
        event.preventDefault();
        const name = draft.trim();
        if (name) void on_add(name).then((added) => added && set_draft(""));
      }}
    >
      <input type="text" aria-label={label} placeholder={`${label}…`} value={draft} onChange={(event) => set_draft(event.currentTarget.value)} />
      <button type="submit" className="accent solid" disabled={!draft.trim()}>
        {button}
      </button>
    </form>
  );
}

// ── Renaming ─────────────────────────────────────────────────────────────────

// A name edited in place: Enter or leaving saves it, Escape gives up.
export function RenameField({ label, value, on_done }: { label: string; value: string; on_done: (name: string | null) => void }) {
  const [draft, set_draft] = useState(value);
  const keyed = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      on_done(draft);
    } else if (event.key === "Escape") {
      event.preventDefault();
      on_done(null);
    }
  };
  return <input type="text" aria-label={label} autoFocus value={draft} onChange={(event) => set_draft(event.currentTarget.value)} onKeyDown={keyed} onBlur={() => on_done(draft)} />;
}

// Which item of a list is being renamed, and the field that renames it; a name left blank or unchanged saves nothing.
export function use_rename<Key>(save: (key: Key, name: string) => void) {
  const [renaming, set_renaming] = useState<Key | null>(null);
  const field = (key: Key, name: string) => (
    <RenameField
      label={`Rename ${name}`}
      value={name}
      on_done={(next) => {
        set_renaming(null);
        const target = next?.trim() ?? "";
        if (target && target !== name) save(key, target);
      }}
    />
  );
  return { renaming, start: (key: Key) => set_renaming(() => key), field };
}

// ── Saving ───────────────────────────────────────────────────────────────────

// Save and Cancel under a form on its own page, Save sending the form.
export function FormButtons({ can_save, on_cancel }: { can_save: boolean; on_cancel: () => void }) {
  return (
    <div className="form-actions inline-row">
      <button type="submit" className="accent solid" disabled={!can_save}>
        Save
      </button>
      <button type="button" onClick={on_cancel}>
        Cancel
      </button>
    </div>
  );
}

// Cancel and Save at the foot of a dialog.
export function DialogButtons({ can_save = true, on_save, on_cancel }: { can_save?: boolean; on_save: () => void; on_cancel: () => void }) {
  return (
    <>
      <button type="button" onClick={on_cancel}>
        Cancel
      </button>
      <button type="button" className="accent solid" disabled={!can_save} onClick={on_save}>
        Save
      </button>
    </>
  );
}
