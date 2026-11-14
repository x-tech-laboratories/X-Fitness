// The pieces every list's rows share: the Actions column of Edit, History and Delete, and the confirm before deleting.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import type { TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { HistoryButton } from "./history/HistoryView.tsx";

// ── Deleting ─────────────────────────────────────────────────────────────────

// Asks before deleting, with a red Delete that runs the call.
export function confirm_delete(title: string, message: ReactNode, run: () => Promise<unknown>): void {
  confirm_dialog({ title, message, confirm_label: "Delete", danger: true, run: async () => void (await run()) });
}

// ── Actions ──────────────────────────────────────────────────────────────────

interface RowActionsOptions<Row> {
  // The row's name, which each button's label carries, such as "Edit Oats".
  name: (row: Row) => string;
  edit?: (row: Row) => void;
  // The row's own buttons after Edit, such as Rename and Move.
  buttons?: (row: Row) => ReactNode;
  // The kind and id its versions are kept under.
  history?: (row: Row) => { kind: string; item_id: string };
  // Buttons after History in place of Delete, such as ones that move the row.
  trailing?: (row: Row) => ReactNode;
  remove?: (row: Row) => void;
  // The delete button's word, "Delete" unless set.
  remove_text?: string;
  width?: number;
  hideable?: boolean;
}

// A table's last column with each row's buttons, in the same order and with the same labels in every list.
export function row_actions_column<Row>({ name, edit, buttons, history, trailing, remove, remove_text = "Delete", width, hideable }: RowActionsOptions<Row>): TableColumn<Row> {
  return {
    label: "Actions",
    id: "actions",
    header: <span className="visually-hidden">Actions</span>,
    class: "actions-cell",
    width,
    hideable,
    cell: (row) => (
      <div className="row-actions">
        {edit && (
          <button type="button" aria-label={`Edit ${name(row)}`} onClick={() => edit(row)}>
            Edit
          </button>
        )}
        {buttons?.(row)}
        {history && <HistoryButton {...history(row)} name={name(row)} />}
        {trailing?.(row)}
        {remove && (
          <button type="button" className="danger" aria-label={`${remove_text} ${name(row)}`} onClick={() => remove(row)}>
            {remove_text}
          </button>
        )}
      </div>
    ),
  };
}
