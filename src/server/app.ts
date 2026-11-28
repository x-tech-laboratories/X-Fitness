// The web server: the page, every data call the page makes, and this server's copy of the data as one of the paired
// devices it syncs with, all on one database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

import fastify, { type FastifyInstance } from "fastify";
import { openapi_document } from "@x-tech-laboratories/x-libs/api_spec";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_call_table } from "@x-tech-laboratories/x-libs/server/call_table";
import { register_mcp_route } from "@x-tech-laboratories/x-libs/server/mcp";
import { register_error_replies, register_lenient_json_body } from "@x-tech-laboratories/x-libs/server/replies";
import { register_accounts } from "@x-tech-laboratories/x-libs/server/account_sign_in";
import { AccountStore } from "@x-tech-laboratories/x-libs/server/account_store";
import type { Accounts } from "@x-tech-laboratories/x-libs/server/passwords";
import type { BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import { register_sync_peer_routes } from "@x-tech-laboratories/x-libs/server/sync_peer_routes";
import { register_web_folder } from "@x-tech-laboratories/x-libs/server/web_folder";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";
import { create_sync_peer, sync_device_methods } from "@x-tech-laboratories/x-libs/sync_peer";
import type { PeerStorage } from "@x-tech-laboratories/x-libs/sync_protocol";

import { fitness_bridge } from "../shared/bridge.ts";
import { mcp_instructions as instructions, without_secrets } from "../shared/mcp.ts";
import { bind_methods, fitness_api, is_read_only, sync_engine } from "../shared/store.ts";
import { register_fitness_calls } from "./calls.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface AppOptions {
  database: SqlDatabase;
  // The users from the accounts file, who are admins; others are added on the Users page.
  declared: Accounts;
  web_folder: string;
  // The database's backups, which an admin manages from the page; one is taken before a device's restore replaces the data.
  backups: BackupMethods;
  // This server's keys and paired devices, and the address they reach it at, such as "https://fitness.example.org/api/";
  // without them it syncs with no device.
  sync?: { storage: PeerStorage; address: string | null };
}

// ── Other programs ───────────────────────────────────────────────────────────

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// ── App ──────────────────────────────────────────────────────────────────────

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ forceCloseConnections: true });
  register_lenient_json_body(app);
  register_error_replies(app);
  const accounts = new AccountStore({ database: options.database, app_name: "X-Fitness", declared: options.declared, token_prefix: "xf" });
  // Backups reach the whole database, the accounts included, and pairing lets a device change all of it, so only an admin may manage them.
  // The sync route needs no sign-in, since every call to it is sealed by a paired device.
  await register_accounts(app, { accounts, cookie_name: "x_fitness_session", read_only_paths: ["/api/mcp"], open_paths: ["/api/sync/peer"], needed: (_method, path) => (path.startsWith("/api/backup/") || path.startsWith("/api/sync/") ? { role: accounts.top_role } : "any") });

  const changes = new EventStream();
  const database = () => options.database;
  const sync_options = options.sync;
  const sync = sync_options
    ? create_sync_peer({
        app: "x-fitness",
        engine: sync_engine,
        database,
        storage: sync_options.storage,
        device_name: "X-Fitness server",
        addresses: () => (sync_options.address ? [sync_options.address] : []),
        on_remote_change: () => changes.announce_change(),
      })
    : null;
  if (sync) {
    app.addHook("onReady", async () => sync.start());
    app.addHook("onClose", async () => sync.stop());
  }

  await app.register(
    async (api) => {
      changes.register(api, "/events");

      register_fitness_calls(api, database, changes);

      api.get("/openapi.json", async () =>
        openapi_document(fitness_api, { title: "X-Fitness", version, description: instructions, path_of: (method) => `/api/call/${method}`, is_read_only }),
      );

      // A change made through MCP is announced to every page, since no page made it.
      await register_mcp_route(api, {
        name: "x-fitness",
        version,
        instructions,
        api: fitness_api,
        is_read_only,
        call: async (method, args) => {
          const methods = bind_methods(database, () => changes.announce_change());
          return without_secrets(method, await fitness_bridge.dispatch(methods, method, args));
        },
      });

      // Backup calls arrive as POST /api/backup/<method> with the arguments as a JSON list.
      register_call_table(api, "/backup", options.backups, { is_read_only });
      if (sync) {
        register_sync_peer_routes(api, sync);
        // The server's own pairing calls, which an admin makes from the page's Sync section.
        register_call_table(api, "/sync", sync_device_methods(sync), { is_read_only });
      }
    },
    { prefix: "/api" },
  );

  await register_web_folder(app, { folder: options.web_folder });
  return app;
}
