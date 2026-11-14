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
    `schema_versions`. Every feature on Drizzle (Body, Workouts and Diet) keeps its tables in `schema.ts`, and `npm run db:generate` writes
    each change as a migration under `migrations/` and bundles them into `migrations/index.ts`; a migration that only
    moves data is made with `npx drizzle-kit generate --config src/shared/<feature>/drizzle.config.ts --custom`.
  - `tables` lists the tables that sync, parents first, with the columns that name a row on every device; on Drizzle,
    `synced_tables(...)` reads them from the schema's primary keys. Rows need
    ids every device can make alone, such as `new_id()`; never an autoincrement key.
  - `methods` take the database first, then the page's arguments, and run synchronously or return a promise. A method
    that only reads is named `list_`, `get_`, `search_`, `lookup_` or `export_`.
  - `api` describes every method for other programs, in `src/shared/<feature>/api.ts`: what it does and a JSON Schema
    per argument, in order. A method without one fails to compile. The server serves them as MCP tools at `/api/mcp`,
    as `/api/openapi.json`, and lets `/api/call/<method>` take the arguments by name (X-Libs `api_spec` and
    `server/mcp`).
  - `after_write`, when given, runs after every write the page, API or MCP makes and before history records it; the
    calculators use it to keep the diet's targets following their plan.
  - `on_open`, when given, runs each time the database opens, after the migrations, for an upgrade SQL cannot do; it
    must change nothing the second time. The calculators use it to carry an old stored body plan into the metrics' goals.
  - Settings keys are namespaced, such as `workouts.default_rest`, with their defaults in `setting_defaults`.
- `src/web/<feature>/index.tsx` exports its view, which gets the route's parts after `#/<feature>`, its pages, which the
  sidebar lists under the feature and the view picks by `#/<feature>/<page>`, and a function giving its sections for the
  Settings page.

The sidebar (`src/web/Sidebar.tsx`) is an X-Libs `Tree`: Overview, then each feature folding open onto its pages, then
Settings at the foot; a feature with one page is a single row. The Overview (`src/web/overview/`) draws from the features' own read calls.
A web section can draw on another's store: Goals (`src/web/goals/`) and Workouts → Training show the calculators' calls
and settings from `src/shared/calculators/`. Goals reads where you are now, edits the weight, body fat and waist
metrics' own goals, and holds the diet plan; the training settings (bar, plates, METs, the lifts and run read) sit under
Settings → Workouts, and each workout's energy under Workouts → Reports.

`src/shared/store.ts` and `src/web/features.tsx` list the features; nothing else knows them.

## History

`src/shared/history/store.ts` keeps a version of every item a write touches through X-Libs `create_history`, one
history per kind of item, each snapshot the item's rows across its tables. `bind_methods` records after every write, so
the page, the API and MCP are all covered; writes that arrive by sync are left to the device that made them.

## Sync

The server and every device run the same store. X-Libs `sync_engine` stamps every write to a synced table through
triggers, value by value; the newest write of each value wins. A device sends its changes within seconds and takes
everyone else's in the same round trip, follows the server's event stream to hear of changes at once, and keeps working
offline. On first connecting, the user chooses whether the server's copy or the device's wins; the other is backed up.

## Units

Every measure is stored in metric (kg, cm, km, kcal) and shown in the units set under Settings, converted with X-Libs
`units`. The page reads the four units once with `shown_units` from `src/web/units.ts` and hands views one `units`
object; `src/web/unit_field.tsx` is the number field that shows a stored value in them.

## Nutrients, labels and targets

`src/shared/diet/model.ts` lists every nutrient once, in `nutrients`, with the unit it is shown in, the group it sits in
and whether its target is a goal to reach or a limit; the store keeps each as a column of `diet_foods` in kcal or grams.
Salt is no column: it is sodium shown × 2.5, which the EU label uses. `labels.ts` holds the presets. A nutrition label
(US, EU and UK, Canada, Australia and NZ, or everything) says which nutrients the page shows, and the `diet.shown`
setting lays the ones switched on or off by hand over it. A target preset (the same four regions' reference amounts)
gives each nutrient's target, which has no default of its own: `diet.target_<nutrient>` is stored only when something
sets it, and `target_of` takes it before the preset. Two things set one: the user by hand, and the plan on
Goals while its daily targets are kept following it, which writes calories, protein, fat and carbs after every
change. So a missing target follows the preset, and a plan or hand value always beats it; never add a default target to
`settings.ts`. The Diary also raises the day's calorie target by the workouts' energy when Settings → Workouts says to eat
them back. `get_diet_targets` gives each target in force with where it came from.

Each diary entry belongs to a meal from the `diet.meals` setting (an id, a name, the time from which new entries fall in
it and its share of the energy target). A new entry takes the meal its logged time falls in, or the one the user picks;
an entry whose meal is gone goes by its logged time again.

## The 3D body

The height is a body metric with the height role, read on or before each day like any reading; sex and birth date are
the `body.sex` and `body.birth_date` settings, edited on Body → Metrics.

`src/shared/body/shape.ts` morphs MakeHuman's CC0 body mesh with its sex, muscle, weight and height targets and its girth
targets. `fit_shape` halves each slider in turn until the model's height, mass (its volume times a density from body
fat) and girths, measured round the same vertices as MakeHuman's tape, match the readings. Each metric's `role` says which
reading it is. The Body page's 3D tab loads the model and three.js only when opened, and fits in a Web Worker.
It shows the body now beside the body at the goals, or the body on another day (a month back to begin with), side by
side sharing one camera, or as an overlay where each layer has its own colour and opacity. Those looks are saved in the
synced `body.shape_looks` setting a moment after the last change. "Shade the change" greys the body now and tints it
red where its skin lies outside the compared body and teal where it lies inside (`change_of_positions`, along each
vertex normal). Compared with another day, a reading only one of the two days has is taken as the same on both
(`shared_measures`), so the bodies differ only where both were measured. Play steps the day through every day with a reading; the last day loaded stays drawn while the next
loads, so the view keeps its place.
