// The page: the shell around every section, and the router between them.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useEffect } from "react";
import { Shell, use_route } from "@x-tech-laboratories/x-libs/web/react/shell";
import { theme_choice } from "@x-tech-laboratories/x-libs/web/theme";

import { page_features } from "./features.tsx";
import { OverviewView } from "./overview/OverviewView.tsx";
import { SettingsView } from "./settings/SettingsView.tsx";
import { Sidebar, SidebarFoot } from "./Sidebar.tsx";

// ── Sections ─────────────────────────────────────────────────────────────────

const theme = theme_choice("x-fitness-theme");

// ── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const route = use_route();
  const [named_section = "overview", ...rest] = route.parts;
  const feature = page_features.find((candidate) => candidate.id === named_section);
  const section = feature || named_section === "settings" ? named_section : "overview";
  const page = feature?.pages.find((candidate) => candidate.id === rest[0]) ?? feature?.pages[0];
  const label = feature ? `${page!.label} · ${feature.label}` : section === "settings" ? "Settings" : "Overview";
  const view_key = route.parts.join("/");

  useEffect(() => {
    document.title = `${label} · X-Fitness`;
  }, [label]);

  return (
    <Shell
      brand="X-Fitness"
      sidebar={<Sidebar features={page_features} section={section} page={page?.id ?? ""} />}
      sidebar_foot={<SidebarFoot section={section} />}
      theme={theme}
      view_key={view_key}
    >
      <Fragment key={view_key}>{feature ? feature.view(rest) : section === "settings" ? <SettingsView /> : <OverviewView />}</Fragment>
    </Shell>
  );
}
