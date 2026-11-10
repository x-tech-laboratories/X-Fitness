// The bridges the hosts that hold a database use: the desktop app's main process and preload, and the web server.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_bridge } from "@x-tech-laboratories/x-libs/electron/bridge";
import { define_events } from "@x-tech-laboratories/x-libs/electron/events";

import { device_api_name, device_method_names, events_api_name, fitness_api_name, type DeviceMethods, type FitnessEvents } from "./page_api.ts";
import { method_names, type FitnessMethods } from "./store.ts";

// ── Bridges ──────────────────────────────────────────────────────────────────

export const fitness_bridge = define_bridge<FitnessMethods>(fitness_api_name, method_names);

export const device_bridge = define_bridge<DeviceMethods>(device_api_name, device_method_names);

export const fitness_events = define_events<FitnessEvents>(events_api_name);
