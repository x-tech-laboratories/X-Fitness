// The X-Fitness daemon, the one program that holds all of the app's work. `--local` runs it as a desktop's local daemon
// on its Unix socket, as the desktop app starts it; otherwise it runs headless on a server, from the config it is given.

// ── Imports ──────────────────────────────────────────────────────────────────

import { local_options_from, run_local_daemon } from "./local.ts";
import { run_headless } from "./headless.ts";

// ── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (process.argv.includes("--local")) await run_local_daemon(local_options_from(process.env));
  else await run_headless();
}

main().catch((error: unknown) => {
  console.error(`x-fitness: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
