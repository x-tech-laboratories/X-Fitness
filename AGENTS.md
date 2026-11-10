# Instructions for AI agents

X-Fitness tracks workouts, diet and body measurements. It is a React page that runs in a browser against its own
server, in Electron with its own database, and on Android in Capacitor with its own database, all syncing through the
server. Read `README.md` first, then `docs/architecture.md`. It follows the
[X-Tech Application Standard](https://x-tech-laboratories.github.io/standards/application/).

## Setup and checks

- `nix-shell` (or `nix develop`) gives Node 24 and an Electron that runs on NixOS; then `npm install`.
- `npm run typecheck`, `npm test` and `npm run lint` must pass before you propose a change.
- While working, run only the tests for what you changed (`npx vitest run tests/<file>`); CI runs the full suite.
- To look at the app, build it and run it under its own Xvfb display with `--mute-audio`, never on the user's screen.

## Rules

- Every feature lives in `src/shared/<feature>/` (store, types, importers) and `src/web/<feature>/` (views, settings);
  `src/shared/store.ts`, `src/web/features.tsx` and `src/web/App.tsx` only list features.
- Code in `src/shared/` runs on the server, in Electron's main process and in the phone's page: no DOM, no `node:` imports.
- A store call that only reads is named `list_`, `get_`, `search_`, `lookup_` or `export_`; any other name announces a change.
- Every store call has a spec in `src/shared/<feature>/api.ts` saying what it does and its arguments, so the API and MCP
  offer it too; describe it for someone who has never seen the page.
- A released migration step is never edited; add a new step after it. For a feature on Drizzle, change `schema.ts` and run `npm run db:generate`.
- Queries go through X-Libs `drizzle` (`drizzle_of(database)`), never an import of `drizzle-orm` itself.
- Store weights in kg, lengths in cm, distances in km and energy in kcal; convert for display with X-Libs `units`.
- Use X-Libs widgets and Halon classes; `app.css` holds layout only and never a colour. A widget two apps could use goes into X-Libs.
- Tests use a throwaway database (`:memory:` or a temp file), never `dev-data/` or a real profile.
- Comments are one plain line saying what the code does now; names are snake_case, components PascalCase.
- Commit messages follow Conventional Commits and end with an `Assisted-by:` trailer naming the tool.
- When a task is ambiguous, stop and ask rather than guess.
