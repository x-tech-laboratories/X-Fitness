// The daemon headless on a server: the config names the database and the backups folder, and it listens on a network
// address behind the X-Libs sign-in, serving the page beside the same handlers a desktop's local daemon serves.

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { read_server_config } from "@x-tech-laboratories/x-libs/server/config";
import { load_accounts } from "@x-tech-laboratories/x-libs/server/passwords";

import { build_app } from "./app.ts";
import { open_daemon } from "./daemon.ts";

// ── Config ───────────────────────────────────────────────────────────────────

interface FitnessConfig {
  database: string;
  backups_folder: string;
}

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// How long a restore waits for the page to have its answer before the daemon stops.
const answer_delay_ms = 500;

// ── Run ──────────────────────────────────────────────────────────────────────

export async function run_headless(): Promise<void> {
  const server_config = read_server_config({
    program: "x-fitness",
    summary: "Serves X-Fitness as a web app and to its desktop and phone apps, and syncs its devices.",
    env_prefix: "X_FITNESS",
    default_port: 7730,
    secret: false,
    web_folder_default: join(import.meta.dirname, "../../out/web"),
    options: { config: { variable: "X_FITNESS_CONFIG", help: "the JSON config naming the database and the backups folder", placeholder: "<file>", required: true } },
  });
  const config = JSON.parse(readFileSync(server_config.values.config!, "utf8")) as FitnessConfig;
  // Read before the database opens, so a daemon without its accounts file stops having touched nothing.
  const declared = load_accounts("X_FITNESS_PASSWORD_HASH_FILE");

  // A restore is staged for the next start, then the daemon stops once the page has its answer, so its service starts
  // it again on the backup.
  const daemon = await open_daemon({
    database_path: resolve(config.database),
    backups_folder: resolve(config.backups_folder),
    version,
    restore: { after_staging: () => void setTimeout(stop, answer_delay_ms) },
  });

  const app = await build_app({
    database: daemon.database,
    changes: daemon.changes,
    declared,
    web_folder: server_config.web_folder,
    backups: daemon.backups,
    device: daemon.device,
    certificates: daemon.certificates,
    local_mcp: daemon.local_mcp,
  });
  await app.listen({ host: server_config.host, port: server_config.port });
  console.info(`X-Fitness is serving http://${server_config.host}:${server_config.port}/`);
  daemon.start();

  function stop(): void {
    void app
      .close()
      .then(() => daemon.stop())
      .finally(() => daemon.close());
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
}
