# X-Fitness

Workouts, diet and body measurements in one app. It runs as a web page served by your own server, as a desktop app and
as an Android app; the desktop and Android apps keep their own copy of the data, work offline, and sync with the server
whenever it can be reached.

- **Workouts:** exercises, routines, logged sessions with their sets, rest timer, and progress per exercise.
- **Diet:** foods and meals, what was eaten each day, and the day's calories and nutrients against targets.
- **Body:** weight, body fat, girths and any measure of your own, with goals and trends, and a 3D body shaped to
  your readings and to your goals.
- **Overview:** today's eating against its targets, the weeks' training and every body metric's trend on one page.

## Running it

```sh
nix-shell                 # Node 24 and an Electron that runs on NixOS
npm install
npm run hash-password -- admin password.hash  # an admin in password.hash, which the dev server reads
npm run dev:server        # the server on http://127.0.0.1:7730, with the data in dev-data/
npm run dev:web           # the page with live reload, reaching that server
npm run dev               # the desktop app, with its profile in dev-data/desktop
```

`npm run build` type-checks and builds the page into `out/web`; `npm start` serves it. `npm run build:desktop` builds
the desktop app into `out/`, and `npm run build:android` builds the phone's page and copies it into `android/`
(build the app itself in `nix develop .#android` with `cd android && ./gradlew assembleDebug`).

## Configuration

The server reads a JSON file named by `X_FITNESS_CONFIG`; `config.example.json` is the complete default:

| Field            | Means                                                     |
| ---------------- | --------------------------------------------------------- |
| `database`       | the SQLite file, made if missing                          |
| `backups_folder` | where the server's backups are kept                       |

The address and port come from `X_FITNESS_HOST` and `X_FITNESS_PORT` (or `--host` and `--port`), 127.0.0.1:7730 unless
set. The admins are read from the accounts file `X_FITNESS_PASSWORD_HASH_FILE` names, one `name:hash` line each;
`npm run hash-password -- <name> <file>` adds one or changes their password. `x-fitness --help` lists every option.

## Signing in

A browser signs in with a name and password, the X-Libs accounts every X-app shares. Unless "Keep me signed in" is
ticked, the session ends when the browser closes; ticked, it lasts until it is signed out from **Your account**. There
each user changes their password, turns on a second factor, sees where they are signed in and makes tokens; an admin
adds users on **Users**.

## Sync

In the desktop or Android app, open **Settings → This device → Sync**, enter the server's address, your name and
password, and choose whether this device starts from the server's data or the server from this device's. The copy that
loses is backed up first. After that, changes go both ways within seconds, and a device that is offline catches up once
it is back. The device gets a token of its own, listed on **Your account**, which Stop syncing gives back.

## Backups

Every copy of the data backs itself up: daily by default, keeping the last 14, and always before a restore, before a
sync takes the other copy, and before an upgrade changes the database. **Settings → Backups** takes one by hand, sets
the schedule and lists every backup to restore or delete; backups taken by hand are kept until deleted. The schedule
belongs to that device or server and is never synced.

- **Desktop:** in `backups/` beside the database in the profile folder. A restore backs up the current data first and
  stops sync, so you choose again which copy wins.
- **Android:** inside the app's own storage, apart from the database, rather than in a folder you pick; the app has no
  file-picking permission to ask for.
- **Server:** in `backups_folder`. Only an admin sees them. The page cannot restore one while the server runs on the
  same database; stop X-Fitness and copy the backup over the database file.

## Other programs: the API and MCP

Every call the page makes is open to other programs on the server, behind a token made on **Your account** and sent as
`Authorization: Bearer <token>`:

- **API:** `POST /api/call/<method>` with the arguments as a JSON list in order, or by name as a JSON object.
  `GET /api/openapi.json` describes every call.
- **MCP:** `/api/mcp` serves every call as a tool over streamable HTTP, the calls that only read marked read-only. To
  add it to Claude Code:

  ```sh
  claude mcp add --transport http x-fitness https://<server>/api/mcp --header "Authorization: Bearer <token>"
  ```

Both work in stored units (kg, cm, km, seconds, kcal) and local days such as `2026-11-10`. A change made through
either reaches every open page and device as if made there. Keys for other services, such as the USDA key, are left out
of what MCP reads.

## NixOS

```nix
inputs.x-fitness.url = "github:x-tech-laboratories/X-Fitness";

imports = [ x-fitness.nixosModules.default ];
services.x-fitness = {
  enable = true;
  passwordHashFile = "/etc/x-fitness/password-hash";
};
```

`packages.default` is the server and `packages.desktop` the desktop app.

## Layout

```
src/
  server/    Fastify app and main.ts
  main/      Electron main process: its database, the page's calls, sync
  preload/   the desktop page's bridge
  web/       the React page, one folder per feature, and hosts/ for web, desktop and Android
  shared/    the store every host runs, one folder per feature, and the bridge's method tables
tests/       one *.test.ts per behaviour
docs/        architecture.md
android/     the Capacitor project
nix/         package.nix, desktop-package.nix, module.nix
```

## License

GPL-3.0-or-later.

The 3D body (`src/web/body/body_model.bin`) is built from the [MakeHuman](https://github.com/makehumancommunity/makehuman)
body mesh and targets, released under CC0 1.0. `node scripts/build_body_model.ts <makehuman/data>` rebuilds it from a
MakeHuman 1.x checkout.
