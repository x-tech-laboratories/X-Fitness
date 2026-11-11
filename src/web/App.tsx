// The page: the sign-in in a browser, the shell around every section, and the router between them.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useEffect } from "react";
import { create_accounts_client, type Me } from "@x-tech-laboratories/x-libs/web/accounts";
import { AccountView, UsersView } from "@x-tech-laboratories/x-libs/web/react/accounts";
import { SyncCertificatePrompt } from "@x-tech-laboratories/x-libs/web/react/certificates";
import { Shell, use_route } from "@x-tech-laboratories/x-libs/web/react/shell";
import { SignInForm, use_account } from "@x-tech-laboratories/x-libs/web/react/sign_in";
import { theme_choice } from "@x-tech-laboratories/x-libs/web/theme";

import { data_watch, page } from "./api.ts";
import { page_features } from "./features.tsx";
import { HistoryView } from "./history/HistoryView.tsx";
import { OverviewView } from "./overview/OverviewView.tsx";
import { SettingsView } from "./settings/SettingsView.tsx";
import { Sidebar, SidebarFoot } from "./Sidebar.tsx";

// ── Sections ─────────────────────────────────────────────────────────────────

const theme = theme_choice("x-fitness-theme");

// Relative, so a server behind a proxy under a folder keeps it.
const accounts = create_accounts_client({ base: "api" });

// Sections outside the features, the account pages only for someone signed in on the server.
const own_sections = ["settings", "account", "users"];

// ── App ──────────────────────────────────────────────────────────────────────

// A browser signs in to the server; the desktop and phone apps keep their own data and sign in only to sync.
// A device that syncs asks to trust its server's certificate whenever sync fails over it.
function DeviceApp() {
  const { certificates, device } = page();
  return <>
    {device && certificates && <SyncCertificatePrompt device={device} certificates={certificates} subscribe={data_watch.subscribe} />}
    <Pages me={null} />
  </>;
}

export function App() {
  return page().host === "web" ? <SignedInApp /> : <DeviceApp />;
}

function SignedInApp() {
  const { account, refresh, sign_out } = use_account(accounts);
  if (account.state === "checking") return null;
  if (account.state === "signed_out") {
    return (
      <Shell brand="X-Fitness" theme={theme} user={null}>
        <SignInForm client={accounts} title="X-Fitness" on_signed_in={refresh} />
      </Shell>
    );
  }
  return <Pages me={account.me} on_sign_out={() => void sign_out()} />;
}

function Pages({ me, on_sign_out }: { me: Me | null; on_sign_out?: () => void }) {
  const route = use_route();
  const [named_section = "overview", ...rest] = route.parts;
  const feature = page_features.find((candidate) => candidate.id === named_section);
  const is_own = named_section === "settings" || named_section === "history" || (me !== null && own_sections.includes(named_section));
  const section = feature || is_own ? named_section : "overview";
  const page = feature?.pages.find((candidate) => candidate.id === rest[0]) ?? feature?.pages[0];
  const own_labels: Record<string, string> = { settings: "Settings", history: "History", account: "Your account", users: "Users" };
  const label = feature ? `${page!.label} · ${feature.label}` : own_labels[section] ?? "Overview";
  const view_key = route.parts.join("/");
  const is_admin = me !== null && me.role === me.roles.at(-1);

  useEffect(() => {
    document.title = `${label} · X-Fitness`;
  }, [label]);

  const view = () => {
    if (feature) return feature.view(rest);
    if (me && section === "account") return <AccountView client={accounts} />;
    if (me && section === "users") return <UsersView client={accounts} me={me} />;
    if (section === "history") return <HistoryView />;
    return section === "settings" ? <SettingsView /> : <OverviewView />;
  };

  return (
    <Shell
      brand="X-Fitness"
      sidebar={<Sidebar features={page_features} section={section} page={page?.id ?? ""} />}
      sidebar_foot={<SidebarFoot section={section} show_users={is_admin} />}
      theme={theme}
      view_key={view_key}
      user={me?.name}
      user_href="#/account"
      on_logout={on_sign_out}
    >
      <Fragment key={view_key}>{view()}</Fragment>
    </Shell>
  );
}
