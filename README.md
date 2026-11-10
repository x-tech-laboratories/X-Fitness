# X-Fitness

Workouts, diet and body measurements in one app. It runs as a web page served by your own server, as a desktop app and
as an Android app; the desktop and Android apps keep their own copy of the data, work offline, and sync with the server
whenever it can be reached.

- **Workouts:** exercises, routines, logged sessions with their sets, rest timer, and progress per exercise.
- **Diet:** foods and meals, what was eaten each day, and the day's calories and nutrients against targets.
- **Body:** weight, body fat, girths and any measure of your own, with goals and trends.

## Running it

```sh
nix-shell                 # Node 24 and an Electron that runs on NixOS
npm install
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
| `backups_folder` | where a copy goes before a device's data replaces it      |

The address and port come from `X_FITNESS_HOST` and `X_FITNESS_PORT` (or `--host` and `--port`), 127.0.0.1:7730 unless
set. The token browsers sign in with and devices sync with is read from the file `X_FITNESS_TOKEN_FILE` names; without
one the server only listens on this machine. `x-fitness --help` lists every option.

## Sync

In the desktop or Android app, open **Settings → This device → Sync**, enter the server's address and token, and choose
whether this device starts from the server's data or the server from this device's. The copy that loses is backed up
first. After that, changes go both ways within seconds, and a device that is offline catches up once it is back.

## NixOS

```nix
inputs.x-fitness.url = "github:x-tech-laboratories/X-Fitness";

imports = [ x-fitness.nixosModules.default ];
services.x-fitness = {
  enable = true;
  tokenFile = "/etc/x-fitness/token";
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
