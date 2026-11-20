// The desktop app's page: the preload has put the main process's calls on the window.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import type { CertificateClient } from "@x-tech-laboratories/x-libs/certificate_protocol";
import type { ConnectionClient } from "@x-tech-laboratories/x-libs/connection_protocol";
import type { EventsClient } from "@x-tech-laboratories/x-libs/electron/events";
import type { LocalMcpClient } from "@x-tech-laboratories/x-libs/local_mcp_protocol";

import { certificates_api_name, connection_certificates_api_name, connections_api_name, desktop_api_name, device_api_name, events_api_name, fitness_api_name, local_mcp_api_name, type DeviceMethods, type FitnessEvents, type PageApi } from "../../shared/page_api.ts";
import type { DesktopMethods } from "../../shared/desktop.ts";
import type { FitnessMethods } from "../../shared/store.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

type DesktopWindow = Record<string, unknown>;

export function is_desktop(): boolean {
  return fitness_api_name in window;
}

export function desktop_api(): PageApi {
  const desktop = window as unknown as DesktopWindow;
  const events = desktop[events_api_name] as EventsClient<FitnessEvents>;
  const device = desktop[device_api_name] as Client<DeviceMethods>;
  // The tray opens the page on a route, such as the workout under way.
  events.on("open", (route) => (location.hash = route));
  return {
    host: "desktop",
    calls: desktop[fitness_api_name] as Client<FitnessMethods>,
    device,
    backups: device,
    certificates: desktop[certificates_api_name] as CertificateClient,
    local_mcp: desktop[local_mcp_api_name] as LocalMcpClient,
    desktop: desktop[desktop_api_name] as Client<DesktopMethods>,
    connections: desktop[connections_api_name] as ConnectionClient,
    connection_certificates: desktop[connection_certificates_api_name] as CertificateClient,
    on_change: (listener) => events.on("changed", listener),
  };
}
