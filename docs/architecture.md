# How X-Fitness is put together

## One page, three hosts

The page in `src/web` is the same React tree everywhere. At start, `src/web/main.tsx` picks the host it runs on and hands
the page a `PageApi` (`src/shared/bridge.ts`):

| Host    | Where the data is                                   | How a call travels                                   | Sync                        |
| ------- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| web     | the server's SQLite file                            | `POST api/call/<method>` with the arguments as JSON  | none; the browser is online |
| desktop | `fitness.db` in Electron's profile folder           | IPC through the preload (`src/preload/index.ts`)     | X-Libs `sync_client`        |
| android | SQLite in WebAssembly, saved to IndexedDB           | straight to the store in the same page               | X-Libs `sync_client`        |

Views never ask which host they are on. They call `calls().<method>(...)` from `src/web/api.ts` and load with
`use_data`, which reloads quietly whenever `data_watch` is bumped: after this page writes, and when another page or
device changed something.

## Features

A feature is two folders:

- `src/shared/<feature>/store.ts` exports a `define_feature({ id, migrations, tables, methods, setting_defaults })`.
  - `migrations` run once each, in order, through X-Libs' `migrate` with the feature as owner, tracked in
    `schema_versions`. A feature on Drizzle (Body and Workouts so far) keeps its tables in `schema.ts`, and `npm run db:generate` writes
    each change as a migration under `migrations/` and bundles them into `migrations/index.ts`; a migration that only
    moves data is made with `npx drizzle-kit generate --config src/shared/<feature>/drizzle.config.ts --custom`.
  - `tables` lists the tables that sync, parents first, with the columns that name a row on every device; on Drizzle,
    `synced_tables(...)` reads them from the schema's primary keys. Rows need
    ids every device can make alone, such as `new_id()`; never an autoincrement key.
  - `methods` take the database first, then the page's arguments, and run synchronously or return a promise. A method
    that only reads is named `list_`, `get_`, `search_`, `lookup_` or `export_`.
  - Settings keys are namespaced, such as `workouts.default_rest`, with their defaults in `setting_defaults`.
- `src/web/<feature>/index.tsx` exports its view, which gets the route's parts after `#/<feature>`, and a function
  giving its sections for the Settings page.

`src/shared/store.ts` and `src/web/features.tsx` list the features; nothing else knows them.

## Sync

The server and every device run the same store. X-Libs `sync_engine` stamps every write to a synced table through
triggers, value by value; the newest write of each value wins. A device sends its changes within seconds and takes
everyone else's in the same round trip, follows the server's event stream to hear of changes at once, and keeps working
offline. On first connecting, the user chooses whether the server's copy or the device's wins; the other is backed up.

## Units

Every measure is stored in metric (kg, cm, km, kcal) and shown in the units set under Settings, converted with X-Libs
`units`.
