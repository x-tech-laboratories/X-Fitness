# X-Fitness

<a href="https://liberapay.com/BeatLink/donate"><img alt="Donate using Liberapay" src="https://liberapay.com/assets/widgets/donate.svg"></a> <a href="https://ko-fi.com/I4V52ANK6N"><img alt="Support me on Ko-fi" src="https://ko-fi.com/img/githubbutton_sm.svg"></a>

Workouts, diet and body measurements in one app. All of its work is done by one daemon, which runs headless on your own
server or as the desktop app's local daemon; the web page, the desktop app and the Android app are views onto it. The
desktop app works on its own computer's daemon or on one on another host, and the local daemon and the Android app keep
their own copy of the data, work offline, and sync with your server whenever it can be reached.

- **Workouts:** exercises with pictures, shown as a table or a grid, filled in from wger or by hand, routines, logged sessions with their sets, rest timer, and progress per exercise.
  Its Training page holds the training calculators: one-rep maxes (Epley, Brzycki, Lombardi, RPE counted) with the
  weight and plates at each share of one, Wilks, DOTS and IPF GoodLift points, a plate calculator, Karvonen heart-rate
  zones, VO2max from runs, the pulse or a Cooper test, and race-time predictions; Reports shows each workout's energy,
  which the diary can add to the day's target.
- **Diet:** foods and meals, what was eaten each day, and the day's calories and nutrients against targets. Around 80
  nutrients, from the macros to vitamins, minerals and amino acids; a country's nutrition label (US, EU and UK, Canada,
  Australia and NZ) picks the ones shown and a region's reference intakes the targets, each changeable by hand.
- **Body:** weight, height, body fat, girths and any measure of your own, logged a day at a time on Metrics, where
  each metric is also added and edited and your sex and birth date sit above them, with a picture of where to pinch
  beside each caliper skinfold; Reports shows goals and trends; Photos keeps progress photos by day and pose, from a
  file or the phone's camera, and compares two days side by side; and 3D a body shaped to your readings and to your goals.
- **Goals:** where you are now, where you want to be (goals for your weight, body fat and any girth, each a number of
  its own apart from the metrics, with helpers that fill the weight in from a BMI and the waist from your height), and
  how you get there: a pace, the daily energy and protein and fat that make the diet targets, set once or kept
  following the plan, and when the goal weight is reached at the plan's rate and at your trend.
- **Calculators:** BMI, body fat by the US Navy tape, by Jackson-Pollock 3- and 7-site calipers and from BMI, lean
  mass and FFMI, waist-to-height and waist-to-hip, BMR and TDEE, water a day, and the TDEE your diary and weight trend
  actually show, filled in from your latest readings, with the seven skinfold sites drawn and numbered over their fields.
- **Overview:** what to do next (each meal at its start, the followed program's next session on its training days, a
  missed one marked), today's eating against its targets, the weeks' training, the last 30 days' energy eaten against
  the energy burned a day and in workouts beside the weight, and every body metric's trend on one page.

## Running it

```sh
nix-shell                 # Node 24 and an Electron that runs on NixOS
npm install
npm run hash-password -- admin password.hash  # an admin in password.hash, which the dev server reads
npm run dev:server        # the server on http://127.0.0.1:7730, with the data in dev-data/
npm run dev:web           # the page with live reload, reaching that server
npm run dev               # the desktop app, with its profile in dev-data/desktop
```

`npm run build` type-checks and builds the page into `out/web`; `npm start` runs the daemon headless and serves it. `npm run build:desktop` builds
the desktop app into `out/`, and `npm run build:android` builds the phone's page and copies it into `android/`
(build the app itself in `nix develop .#android` with `cd android && ./gradlew assembleDebug`).

## Configuration

The daemon on a server reads a JSON file named by `X_FITNESS_CONFIG`; `config.example.json` is the complete default:

| Field            | Means                                                     |
| ---------------- | --------------------------------------------------------- |
| `database`       | the SQLite file, made if missing                          |
| `backups_folder` | where the server's backups are kept                       |

The address and port come from `X_FITNESS_HOST` and `X_FITNESS_PORT` (or `--host` and `--port`), 127.0.0.1:7730 unless
set. The admins are read from the accounts file `X_FITNESS_PASSWORD_HASH_FILE` names, one `name:hash` line each;
`npm run hash-password -- <name> <file>` adds one or changes their password. `x-fitness --help` lists every option.

## The daemon and the desktop app

X-Fitness is one daemon, `src/server/main.ts`, that holds the database and does all the work: the page's calls, sync,
backups, history, the API and MCP. It runs in one of two ways, serving the same calls either way:

- **Headless on a server**, from `npm start`, `x-fitness` or the NixOS module, listening on a network address behind
  the sign-in.
- **As the desktop app's local daemon** (`--local`), on a Unix socket only you can open
  (`$XDG_RUNTIME_DIR/x-fitness/daemon.sock`), with no sign-in and no network port. The desktop app starts it on
  Electron's own binary when "This computer" is chosen and none is running. Its log is
  `~/.local/state/x-fitness/daemon.log`. A profile other than the installed app's, such as `X_FITNESS_USER_DATA` in dev,
  gets a socket and log of its own, so it never reaches your daemon.

**Settings → Connections** lists the daemons the desktop app can work on, like Deluge's connection manager: **This
computer** for the local daemon, and daemons on other hosts added by address, name and password. Each is signed in once
as this computer, with a token of its own listed on that daemon's **Your account**; Remove gives it back. **Connect**
switches, and the window loads again from the chosen daemon. A daemon whose https certificate this computer refuses,
such as a home server's self-signed one, is reached only once you trust that certificate. The app opens on the daemon it
used last. The local daemon keeps running and syncing while you work on another one, so a laptop has its data offline.
On a daemon on another host, only an admin reaches its Sync, Backups and MCP server settings.

Closing the window leaves the local daemon running: sync, backups, reminders and the MCP server carry on, and the window
opens again straight onto the data. A tray icon shows the workout under way with its time and a Finish, lists the next
meals and training sessions, and brings the window back; **Quit completely** there or under **Settings → Desktop** stops
the local daemon too.

The local daemon also reminds you, with a desktop notification, as each training day's session comes due (turned off
under **Settings → Workouts → Schedule**, which also sets the time for training days without one) and, once turned on
under **Settings → Diet → Meals**, as each timed meal starts unless something is already logged in it. A click opens the
app on the workout log or the diary: the app opens `x-fitness://<page>` links, such as `x-fitness://diet/diary`.

**Settings → Desktop** turns off the tray icon, keeping running in the background, and starting at login, which runs
`x-fitness-desktop --daemon` to start the local daemon without opening the window. These belong to the computer, are kept
in `desktop.json` in the profile and are never synced.

Not yet: the local daemon does not offer "Let other devices connect" (a network port behind the sign-in), and the
desktop app does not show reminders for a daemon on another host; the local daemon's own reminders still come while it
runs. The Android app keeps its own synced copy and offers no connections: its page works on that copy, which a list of
daemons to switch between would bypass, and it picks the daemon it syncs with under **Sync**.

## Signing in

A browser signs in with a name and password, the X-Libs accounts every X-app shares. Unless "Keep me signed in" is
ticked, the session ends when the browser closes; ticked, it lasts until it is signed out from **Your account**. There
each user changes their password, turns on a second factor, sees where they are signed in and makes tokens; an admin
adds users on **Users**.

## Sync

The local daemon and the Android app each keep their own copy and sync it with your server. In the desktop app on
**This computer**, or in the Android app, open **Settings → This device → Sync**, enter the server's address, your name and
password, and choose whether this device starts from the server's data or the server from this device's. The copy that
loses is backed up first. After that, changes go both ways within seconds, and a device that is offline catches up once
it is back. The device gets a token of its own, listed on **Your account**, which Stop syncing gives back.

## Backups

Every copy of the data backs itself up: daily by default, keeping the last 14, and always before a restore, before a
sync takes the other copy, and before an upgrade changes the database. **Settings → Backups** takes one by hand, sets
the schedule and lists every backup to restore or delete; backups taken by hand are kept until deleted. The schedule
belongs to that device or server and is never synced.

- **Desktop:** the local daemon's, in `backups/` beside the database in the profile folder. A restore backs up the current data first and
  stops sync, so you choose again which copy wins.
- **Android:** in a folder you pick once under **Settings → Backups → Backup folder**, such as Documents, where file
  managers and sync apps reach them. Until one is picked there are none, and daily backups wait. A restore backs up the
  current data first and stops sync.
- **Server:** in `backups_folder`. Only an admin sees them. A restore from the page backs up the current data first,
  then the server stops and its service starts it again on the backup; every device then chooses which copy wins.

## History

Every change to a workout (its exercises and sets included), program, exercise, food, recipe, diary entry, body metric,
day of body readings, body goal or progress photo is kept as a version, whichever device, page, API call or MCP tool made it. **History** in the
sidebar lists the latest changes, and **History** beside any of those items lists its versions: any version can be
restored, and a deleted item brought back with what was deleted along with it. Versions sync, so every device sees the
same history. Changes older than **Settings → General → History** (180 days unless set) are pruned, each item keeping
its latest.

Categories, units and the grocery list are left out: they are lists to pick from or tick off rather than things made
and edited, and a deleted category or unit is typed again in a moment.

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

The local daemon can serve the same MCP tools itself, on its own data and with no server or token: turn on **Settings →
MCP server** and, while it runs, it listens on `http://127.0.0.1:3918/mcp` (the port is set there too), reachable only
from the same computer:

```sh
claude mcp add --transport http x-fitness http://127.0.0.1:3918/mcp
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

`packages.default` is the daemon for a server and `packages.desktop` the desktop app, which runs the same daemon as its
local one.

## Layout

```
src/
  server/    the daemon: main.ts, headless.ts on a server, local.ts as a desktop's local daemon, daemon.ts for what
             both hold, and app.ts for the handlers both serve
  main/      Electron main process: the window, the tray icon, the login entry and the connections, passing calls to
             the chosen daemon
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
