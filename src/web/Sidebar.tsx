// The sidebar: Overview and History on top, each feature folding open onto its pages, and Settings at the foot.

// ── Imports ──────────────────────────────────────────────────────────────────

import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Tree } from "@x-tech-laboratories/x-libs/web/react/tree";

import type { PageFeature } from "./features.tsx";

// ── Rows ─────────────────────────────────────────────────────────────────────

// A feature's row has no parent; a page's row names its feature as parent and has the id "<feature>/<page>".
interface SidebarRow {
  id: string;
  parent_id: string | null;
  position: number;
  label: string;
  href: string;
}

function rows_of(features: PageFeature[]): SidebarRow[] {
  return features.flatMap((feature, feature_index) => [
    { id: feature.id, parent_id: null, position: feature_index, label: feature.label, href: `#/${feature.id}` },
    ...feature.pages.map((page, page_index) => ({ id: `${feature.id}/${page.id}`, parent_id: feature.id, position: page_index, label: page.label, href: `#/${feature.id}/${page.id}` })),
  ]);
}

function is_id_list(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  features: PageFeature[];
  // The route's first part, such as "workouts", "overview" or "settings".
  section: string;
  // The page within that section, such as "log".
  page: string;
}

export function Sidebar({ features, section, page }: SidebarProps) {
  const [collapsed_ids, set_collapsed_ids] = use_pref("x-fitness-sidebar-collapsed", [] as string[], is_id_list);
  const collapsed = new Set(collapsed_ids);
  // A folded feature lights up itself in place of its hidden page.
  const selected_id = collapsed.has(section) ? section : `${section}/${page}`;

  return (
    <>
      <div className="sidebar-nav">
        <a href="#/overview" className={section === "overview" ? "tree-row active" : "tree-row"} aria-current={section === "overview" ? "page" : undefined}>
          <span className="tree-label">Overview</span>
        </a>
        <a href="#/history" className={section === "history" ? "tree-row active" : "tree-row"} aria-current={section === "history" ? "page" : undefined}>
          <span className="tree-label">History</span>
        </a>
      </div>
      <Tree
        items={rows_of(features)}
        label="Sections"
        render_item={(row) => row.label}
        name_of={(row) => row.label}
        collapsed={collapsed}
        on_collapsed_change={(next) => set_collapsed_ids([...next])}
        selected_id={selected_id}
        on_select={(row) => {
          window.location.hash = row.href.slice(1);
        }}
      />
    </>
  );
}

// Users, for an admin signed in on the server, above the Shell's own theme, account and Settings rows.
export function SidebarFoot({ section, show_users = false }: { section: string; show_users?: boolean }) {
  const row = (id: string, label: string) => (
    <a href={`#/${id}`} className={section === id ? "tree-row active" : "tree-row"} aria-current={section === id ? "page" : undefined}>
      <span className="tree-label">{label}</span>
    </a>
  );
  return show_users ? row("users", "Users") : null;
}
