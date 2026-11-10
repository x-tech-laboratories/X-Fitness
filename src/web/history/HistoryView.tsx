// History: the latest changes to every item on a page of their own, and one item's versions in a dialog opened from
// the item, each version restorable.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { VersionKind } from "@x-tech-laboratories/x-libs/history";
import { StateBadge, type Tone } from "@x-tech-laboratories/x-libs/web/react/badges";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog, open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { PageHeading, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import type { ItemChange } from "../../shared/history/store.ts";
import { calls, use_data } from "../api.ts";

// ── Wording ──────────────────────────────────────────────────────────────────

const change_labels: Record<VersionKind, [text: string, tone: Tone]> = {
  first_seen: ["Already here", "none"],
  created: ["Created", "good"],
  edited: ["Edited", "info"],
  deleted: ["Deleted", "bad"],
  restored: ["Restored", "warn"],
};

function when(changed_at: string): string {
  return new Date(changed_at).toLocaleString();
}

// Brings the version back after a confirm, since the item's current state becomes a version of its own.
function restore(change: ItemChange, on_done?: () => void): void {
  confirm_dialog({
    title: change.change === "deleted" ? `Bring back ${change.item_name}?` : `Restore ${change.item_name}?`,
    message: change.change === "deleted" ? "It comes back as it was when deleted, with what was deleted along with it." : `It goes back to how it was on ${when(change.changed_at)}; the way it is now stays in its history.`,
    confirm_label: change.change === "deleted" ? "Bring back" : "Restore",
    run: async () => {
      try {
        await calls().restore_item_version(change.kind, change.id);
        toast(`${change.item_name} is back as it was`, { tone: "good" });
        on_done?.();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), { tone: "bad" });
      }
    },
  });
}

// ── One item ─────────────────────────────────────────────────────────────────

function ItemHistoryDialog({ kind, item_id, name, on_close }: { kind: string; item_id: string; name: string; on_close: () => void }) {
  const versions = use_data((api) => api.list_item_history(kind, item_id), [kind, item_id]);
  const columns: TableColumn<ItemChange>[] = [
    { label: "When", cell: (change) => when(change.changed_at) },
    { label: "Change", cell: (change) => <StateBadge labels={change_labels} state={change.change} /> },
    { label: "Was", cell: (change) => <>{change.item_name} <span className="muted small">{change.summary}</span></> },
    { label: "Made", cell: (change) => (change.origin === "here" ? "Here" : "On another device") },
    {
      label: "Actions",
      id: "actions",
      header: <span className="visually-hidden">Actions</span>,
      class: "actions-cell",
      cell: (change) => (change.change === "deleted" || change.id === newest ? null : <button type="button" onClick={() => restore(change, on_close)}>Restore</button>),
    },
  ];
  // The newest version is how the item is now, so only the ones before it are offered.
  const newest = versions.data?.[0]?.id;
  return (
    <Dialog title={`History of ${name}`} on_close={on_close}>
      <Loaded resource={versions}>
        {(list) => (list.length === 0 ? <Empty title="No history yet." /> : <DataTable caption={`History of ${name}`} columns={columns} rows={list} row_key={(change) => change.id} />)}
      </Loaded>
    </Dialog>
  );
}

// Opens an item's versions, such as from a workout's or a food's row.
export function open_item_history(kind: string, item_id: string, name: string): void {
  open_dialog((close) => <ItemHistoryDialog kind={kind} item_id={item_id} name={name} on_close={close} />);
}

export function HistoryButton({ kind, item_id, name }: { kind: string; item_id: string; name: string }) {
  return (
    <button type="button" aria-label={`History of ${name}`} title="History" onClick={() => open_item_history(kind, item_id, name)}>
      History
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const limits: [number, string][] = [[50, "Last 50"], [200, "Last 200"], [1000, "Last 1000"]];

export function HistoryView() {
  const [limit, set_limit] = useState(50);
  const changes = use_data((api) => api.list_recent_changes(limit), [limit]);
  const columns: TableColumn<ItemChange>[] = [
    { label: "When", cell: (change) => when(change.changed_at) },
    { label: "What", cell: (change) => change.kind_label },
    { label: "Item", cell: (change) => <>{change.item_name} <span className="muted small">{change.summary}</span></> },
    { label: "Change", cell: (change) => <StateBadge labels={change_labels} state={change.change} /> },
    { label: "Made", cell: (change) => (change.origin === "here" ? "Here" : "On another device") },
    {
      label: "Actions",
      id: "actions",
      header: <span className="visually-hidden">Actions</span>,
      class: "actions-cell",
      cell: (change) => (
        <div className="row-actions">
          <button type="button" onClick={() => open_item_history(change.kind, change.item_id, change.item_name)}>History</button>
          {change.change === "deleted" && <button type="button" onClick={() => restore(change)}>Bring back</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeading title="History" subtitle="The latest changes to workouts, programs, exercises, foods, recipes, the diary and body readings." />
      <Toolbar>
        <Select label="Changes shown" options={limits} value={limit} on_change={set_limit} />
      </Toolbar>
      <Loaded resource={changes}>
        {(list) => (list.length === 0 ? <Empty title="No changes yet." /> : <DataTable caption="Latest changes" columns={columns} rows={list} row_key={(change) => `${change.kind}:${change.id}`} />)}
      </Loaded>
    </>
  );
}
