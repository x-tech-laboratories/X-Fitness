// Gives the desktop app's page its calls to the main process, under the names the page looks for.

// ── Imports ──────────────────────────────────────────────────────────────────

import { contextBridge, ipcRenderer } from "electron";

import { certificate_bridge, device_bridge, fitness_bridge, fitness_events } from "../shared/bridge.ts";

// ── Bridge ───────────────────────────────────────────────────────────────────

fitness_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
device_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
certificate_bridge.expose(contextBridge, ipcRenderer, { envelopes: true });
fitness_events.expose(contextBridge, ipcRenderer);
