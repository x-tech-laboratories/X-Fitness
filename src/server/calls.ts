// The calls the web server and the desktop daemon both answer: the page's data calls on the database, and any other
// table of calls, such as backups or sync settings, each telling the other pages when it changed something.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { positional_args } from "@x-tech-laboratories/x-libs/api_spec";
import type { EventStream } from "@x-tech-laboratories/x-libs/server/events";
import { send_text } from "@x-tech-laboratories/x-libs/server/replies";
import type { SqlDatabase } from "@x-tech-laboratories/x-libs/sql";

import { fitness_bridge } from "../shared/bridge.ts";
import { bind_methods, fitness_api, is_read_only, type FitnessMethods } from "../shared/store.ts";

// ── Data calls ───────────────────────────────────────────────────────────────

// An import, such as a Liftosaur file, arrives as one call's argument.
const import_body_limit = 32 * 1024 * 1024;

// Calls arrive as POST <prefix>/call/<method> with the arguments as a JSON list, or by name as a JSON object.
export function register_fitness_calls(api: FastifyInstance, database: () => SqlDatabase, changes: EventStream): void {
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
    if (is_read_only(request.params.method)) reply.header("cache-control", "no-store");
    // Fastify would send a string as bare text, which the caller could not tell from JSON.
    return reply.type("application/json").send(JSON.stringify(result));
  });
}

// ── Other calls ──────────────────────────────────────────────────────────────

export interface MethodCallOptions {
  // Runs after a call that is not named as only reading, with the client id of the page that made it.
  on_change?: (client_id: string) => void;
}

// Calls arrive as POST <path>/<method> with the arguments as a JSON list; a call named in no table is refused.
export function register_method_calls(api: FastifyInstance, path: string, methods: object, changes: EventStream, options: MethodCallOptions = {}): void {
  api.post<{ Params: { method: string } }>(`${path}/:method`, async (request, reply) => {
    const { method } = request.params;
    if (!Object.hasOwn(methods, method)) return send_text(reply, 404, `no call named ${method}`);
    const args = Array.isArray(request.body) ? (request.body as unknown[]) : [];
    const result: unknown = await (methods as Record<string, (...args: unknown[]) => unknown>)[method]!(...args);
    if (!is_read_only(method)) options.on_change?.(changes.client_id_of(request));
    if (result === undefined) return reply.code(204).send();
    // Fastify would send a string as bare text, which the caller could not tell from JSON.
    return reply.header("cache-control", "no-store").type("application/json").send(JSON.stringify(result));
  });
}
