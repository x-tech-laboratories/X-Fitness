// The web server: the page, every data call the page makes, and the sync every device runs against, all on one database.

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

import fastify, { type FastifyInstance } from "fastify";
import { openapi_document, positional_args } from "@x-tech-laboratories/x-libs/api_spec";
import { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { register_mcp_route } from "@x-tech-laboratories/x-libs/server/mcp";
import { register_error_replies, register_lenient_json_body, send_text } from "@x-tech-laboratories/x-libs/server/replies";
import { register_accounts } from "@x-tech-laboratories/x-libs/server/account_sign_in";
import { AccountStore } from "@x-tech-laboratories/x-libs/server/account_store";
import type { Accounts } from "@x-tech-laboratories/x-libs/server/passwords";
import { backup_method_names, type BackupMethods } from "@x-tech-laboratories/x-libs/backup_protocol";
import { register_sync_routes } from "@x-tech-laboratories/x-libs/server/sync_routes";
import { register_web_folder } from "@x-tech-laboratories/x-libs/server/web_folder";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { fitness_bridge } from "../shared/bridge.ts";
import { mcp_instructions as instructions, without_secrets } from "../shared/mcp.ts";
import { bind_methods, fitness_api, is_read_only, sync_engine, type FitnessMethods } from "../shared/store.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export interface AppOptions {
  database: SqlDatabase;
  // The users from the accounts file, who are admins; others are added on the Users page.
  declared: Accounts;
  web_folder: string;
  // The database's backups, which an admin manages from the page; one is taken before a device's data replaces it.
  backups: BackupMethods;
}

// ── Other programs ───────────────────────────────────────────────────────────

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// ── App ──────────────────────────────────────────────────────────────────────

// An import, such as a Trilium or Liftosaur file, arrives as one call's argument.
const import_body_limit = 32 * 1024 * 1024;

export async function build_app(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify({ forceCloseConnections: true });
  register_lenient_json_body(app);
  register_error_replies(app);
  const accounts = new AccountStore({ database: options.database, app_name: "X-Fitness", declared: options.declared, token_prefix: "xf" });
  // Backups reach the whole database, the accounts included, so only an admin may manage them.
  await register_accounts(app, { accounts, cookie_name: "x_fitness_session", read_only_paths: ["/api/mcp"], needed: (_method, path) => (path.startsWith("/api/backup/") ? { role: accounts.top_role } : "any") });

  const changes = new EventStream();
  const database = () => options.database;

  await app.register(
    async (api) => {
      changes.register(api, "/events");

      // Calls arrive as POST /api/call/<method> with the arguments as a JSON list, or by name as a JSON object.
      api.post<{ Params: { method: string } }>("/call/:method", { bodyLimit: import_body_limit }, async (request, reply) => {
        const body: unknown = request.body ?? [];
        const spec = fitness_api[request.params.method as keyof FitnessMethods];
        let args: unknown[];
        if (Array.isArray(body)) args = body;
        else if (spec && typeof body === "object" && body !== null) {
          try {
            args = positional_args(spec, body as Record<string, unknown>);
          } catch (error) {
            return send_text(reply, 400, (error as Error).message);
          }
        } else return send_text(reply, 400, "send the arguments as a JSON list or object");
        const methods = bind_methods(database, () => changes.announce_change(changes.client_id_of(request)));
        const result = await fitness_bridge.dispatch(methods, request.params.method, args);
        if (result === undefined) return reply.code(204).send();
        return is_read_only(request.params.method) ? reply.header("cache-control", "no-store").send(result) : reply.send(result);
      });

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
      api.post<{ Params: { method: string } }>("/backup/:method", async (request, reply) => {
        const method = request.params.method as keyof BackupMethods;
        if (!(backup_method_names as readonly string[]).includes(method)) return send_text(reply, 404, `no backup call named ${method}`);
        const args = Array.isArray(request.body) ? (request.body as unknown[]) : [];
        const result: unknown = await (options.backups[method] as (...args: unknown[]) => unknown)(...args);
        return result === undefined ? reply.code(204).send() : reply.header("cache-control", "no-store").send(result);
      });
      register_sync_routes(api, {
        engine: sync_engine,
        database,
        back_up: async () => void (await options.backups.create_backup()),
        on_change: (request) => changes.announce_change(changes.client_id_of(request)),
      });
    },
    { prefix: "/api" },
  );

  await register_web_folder(app, { folder: options.web_folder });
  return app;
}
