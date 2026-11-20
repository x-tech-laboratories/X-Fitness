// The daemon's handlers, one set for every UI: the page's data calls and their change events, the API's description
// and MCP, sync for other daemons and devices, and the daemon's own sync, backups, certificates and MCP settings. On the
// network they sit behind the X-Libs sign-in; on a desktop's Unix socket, which only its user can open, they need none.

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

import fastify, { type FastifyInstance } from "fastify";
import { openapi_document } from "@x-tech-laboratories/x-libs/api_spec";
import type { BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import type { CertificateMethods } from "@x-tech-laboratories/x-libs/certificate_protocol";
import type { LocalMcpMethods } from "@x-tech-laboratories/x-libs/local_mcp_protocol";
import type { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_call_table } from "@x-tech-laboratories/x-libs/server/call_table";
import { register_mcp_route } from "@x-tech-laboratories/x-libs/server/mcp";
import { register_error_replies, register_lenient_json_body } from "@x-tech-laboratories/x-libs/server/replies";
import { register_accounts } from "@x-tech-laboratories/x-libs/server/account_sign_in";
import { AccountStore } from "@x-tech-laboratories/x-libs/server/account_store";
import type { Accounts } from "@x-tech-laboratories/x-libs/server/passwords";
import { register_sync_routes } from "@x-tech-laboratories/x-libs/server/sync_routes";
import { register_web_folder } from "@x-tech-laboratories/x-libs/server/web_folder";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { fitness_bridge } from "../shared/bridge.ts";
import type { DaemonMethods } from "../shared/desktop.ts";
import { mcp_instructions as instructions, without_secrets } from "../shared/mcp.ts";
import type { DeviceMethods } from "../shared/page_api.ts";
import { bind_methods, fitness_api, is_read_only, sync_engine } from "../shared/store.ts";
import { register_fitness_calls } from "./calls.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface AppOptions {
  database: () => SqlDatabase;
  changes: EventStream;
  // The users from the accounts file, who are admins, on the network; null on the local socket, which needs no sign-in.
  declared: Accounts | null;
  // The built page, served on the network; none on the socket.
  web_folder?: string;
  // The database's backups; one is taken before a device's data replaces it.
  backups: BackupMethods;
  // This daemon's own sync with another daemon, and its backups again, as a desktop's page reaches them.
  device: DeviceMethods;
  // The certificates this daemon's sync trusts.
  certificates: CertificateMethods;
  // This daemon's MCP endpoint on 127.0.0.1.
  local_mcp: LocalMcpMethods;
  // Stopping, which only a desktop's local daemon offers.
  daemon?: DaemonMethods;
}

// Paths that reach the whole database or this daemon itself, which only an admin may use on the network.
export const admin_paths = ["/api/backup/", "/api/device/", "/api/certificates/", "/api/local_mcp/", "/api/daemon/"];

// ── Other programs ───────────────────────────────────────────────────────────

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// An import, such as a Liftosaur file, arrives as one call's argument, and sync pushes can be large.
const body_limit = 4 * 1024 * 1024;

// ── App ──────────────────────────────────────────────────────────────────────

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ bodyLimit: body_limit, forceCloseConnections: true });
  register_lenient_json_body(app);
  register_error_replies(app);
  if (options.declared !== null) {
    const accounts = new AccountStore({ database: options.database(), app_name: "X-Fitness", declared: options.declared, token_prefix: "xf" });
    await register_accounts(app, {
      accounts,
      cookie_name: "x_fitness_session",
      read_only_paths: ["/api/mcp"],
      needed: (_method, path) => (admin_paths.some((prefix) => path.startsWith(prefix)) ? { role: accounts.top_role } : "any"),
    });
  }

  const { changes, database } = options;
  // A change from one page reaches the others; the one that made it already shows it.
  const tell_others = (client_id: string): void => changes.announce_change(client_id);

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

      // Each table's calls arrive as POST /api/<table>/<method> with the arguments as a JSON list.
      register_call_table(api, "/backup", options.backups, { is_read_only });
      register_call_table(api, "/device", options.device, { is_read_only, on_change: tell_others });
      register_call_table(api, "/certificates", options.certificates, { is_read_only });
      register_call_table(api, "/local_mcp", options.local_mcp, { is_read_only });
      if (options.daemon) register_call_table(api, "/daemon", options.daemon, { is_read_only, on_change: tell_others });

      register_sync_routes(api, {
        engine: sync_engine,
        database,
        back_up: async () => void (await options.backups.create_backup()),
        on_change: (request) => changes.announce_change(changes.client_id_of(request)),
      });
    },
    { prefix: "/api" },
  );

  if (options.web_folder !== undefined) await register_web_folder(app, { folder: options.web_folder });
  return app;
}
