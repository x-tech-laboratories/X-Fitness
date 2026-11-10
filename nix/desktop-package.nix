{
  lib,
  buildNpmPackage,
  nodejs_24,
  electron_43,
  makeWrapper,
  copyDesktopItems,
  makeDesktopItem,
}:

buildNpmPackage {
  pname = "x-fitness-desktop";
  version = (lib.importJSON ../package.json).version;
  src = lib.cleanSource ../.;

  nodejs = nodejs_24;
  npmDepsHash = import ./npm-deps-hash.nix;
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  nativeBuildInputs = [
    makeWrapper
    copyDesktopItems
  ];

  npmBuildScript = "build:desktop";

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-save --ignore-scripts
    mkdir -p $out/lib/x-fitness-desktop
    cp -r out package.json node_modules resources $out/lib/x-fitness-desktop/
    install -Dm644 resources/icon.png $out/share/icons/hicolor/512x512/apps/x-fitness.png
    makeWrapper ${lib.getExe electron_43} $out/bin/x-fitness-desktop \
      --add-flags $out/lib/x-fitness-desktop \
      --unset ELECTRON_RUN_AS_NODE

    runHook postInstall
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "x-fitness";
      desktopName = "X-Fitness";
      comment = "Workouts, diet and body measurements";
      exec = "x-fitness-desktop";
      icon = "x-fitness";
      categories = [ "Utility" ];
    })
  ];

  meta = {
    description = "X-Fitness as a desktop app with its own database";
    license = lib.licenses.gpl3Plus;
    mainProgram = "x-fitness-desktop";
  };
}
