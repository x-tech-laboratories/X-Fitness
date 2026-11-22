// The sidebar: Overview and History on top, each feature folding open onto its pages, and Settings at the foot.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { ShellSection } from "@x-tech-laboratories/x-libs/web/react/shell";
import { SyncButton } from "@x-tech-laboratories/x-libs/web/react/sync_settings";

import { data_watch, page } from "./api.ts";
import type { PageFeature } from "./features.tsx";

// ── Sections ─────────────────────────────────────────────────────────────────

// Where the folded features are kept.
export const sidebar_pref = "x-fitness-sidebar-collapsed";

// Overview and History, then each feature folding open onto its pages; a feature with one page is only its own row.
export function sidebar_sections(features: PageFeature[]): ShellSection[] {
  return [
    { id: "overview", label: "Overview", href: "#/overview" },
    { id: "history", label: "History", href: "#/history" },
    ...features.map((feature) => ({
      id: feature.id,
      label: feature.label,
      href: `#/${feature.id}`,
      children: feature.pages.length < 2 ? undefined : feature.pages.map((page) => ({ id: page.id, label: page.label, href: `#/${feature.id}/${page.id}` })),
    })),
  ];
}

// Sync on a device that syncs, and Users for an admin signed in on the server, above the Shell's own theme, account and Settings rows.
export function SidebarFoot({ section, show_users = false }: { section: string; show_users?: boolean }) {
  const { device } = page();
  const row = (id: string, label: string) => (
    <a href={`#/${id}`} className={section === id ? "tree-row active" : "tree-row"} aria-current={section === id ? "page" : undefined}>
      <span className="tree-label">{label}</span>
    </a>
  );
  return (
    <>
      {device && <SyncButton device={device} subscribe={data_watch.subscribe} on_open_settings={() => (window.location.hash = "/settings")} />}
      {show_users && row("users", "Users")}
    </>
  );
}
