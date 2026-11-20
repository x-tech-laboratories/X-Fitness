// The page's data calls on the database, as the web server and the desktop daemon both answer them, taking the
// arguments in order or by name and telling the other pages when a call changed something.

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
