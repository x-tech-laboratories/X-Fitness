// The bridges the desktop app's main process and preload use, and the web server's call table.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_bridge } from "@x-tech-laboratories/x-libs/electron/bridge";
import { certificate_method_names, type CertificateMethods } from "@x-tech-laboratories/x-libs/certificate_protocol";
import { local_mcp_method_names, type LocalMcpMethods } from "@x-tech-laboratories/x-libs/local_mcp_protocol";
import { peer_listening_method_names, type PeerListeningMethods } from "@x-tech-laboratories/x-libs/sync_protocol";
import { define_events } from "@x-tech-laboratories/x-libs/electron/events";

import { desktop_method_names, type DesktopMethods } from "./desktop.ts";
import { certificates_api_name, desktop_api_name, device_api_name, listening_api_name, local_mcp_api_name, device_method_names, events_api_name, fitness_api_name, type DeviceMethods, type FitnessEvents } from "./page_api.ts";
import { method_names, type FitnessMethods } from "./store.ts";

// ── Bridges ──────────────────────────────────────────────────────────────────

export const fitness_bridge = define_bridge<FitnessMethods>(fitness_api_name, method_names);

export const device_bridge = define_bridge<DeviceMethods>(device_api_name, device_method_names);

// Certificates the user chose to trust, such as a home server's self-signed one.
export const certificate_bridge = define_bridge<CertificateMethods>(certificates_api_name, certificate_method_names);

// Whether paired devices may connect to this computer's daemon, and on which port.
export const listening_bridge = define_bridge<PeerListeningMethods>(listening_api_name, peer_listening_method_names);

// The desktop app's own MCP endpoint, for AI clients on the same computer.
export const local_mcp_bridge = define_bridge<LocalMcpMethods>(local_mcp_api_name, local_mcp_method_names);

// The desktop app's own settings and quitting, answered by the main process.
export const desktop_bridge = define_bridge<DesktopMethods>(desktop_api_name, desktop_method_names);

export const fitness_events = define_events<FitnessEvents>(events_api_name);
