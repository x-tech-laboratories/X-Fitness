self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.x-fitness;
  inherit (lib)
    literalExpression
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  state_directory = "/var/lib/x-fitness";

  config_file = (pkgs.formats.json { }).generate "x-fitness.json" {
    database = "${state_directory}/fitness.db";
    backups_folder = "${state_directory}/backups";
  };
in
{
  options.services.x-fitness = {
    enable = mkEnableOption "X-Fitness, a web app for workouts, diet and body measurements that its devices sync with";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = literalExpression "x-fitness (from flake)";
      description = "The X-Fitness package to use.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Address the page, API and sync listen on.";
    };

    port = mkOption {
      type = types.port;
      default = 7730;
      description = "Port the page, API and sync listen on.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open the port in the firewall.";
    };

    passwordHashFile = mkOption {
      type = types.str;
      example = "/etc/x-fitness/password-hash";
      description = ''
        The accounts file: one `name:hash` line per admin, from `npm run hash-password`. Admins add other users on the
        Users page.
      '';
    };
  };

  config = mkIf cfg.enable {
    systemd.services.x-fitness = {
      description = "X-Fitness";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        X_FITNESS_CONFIG = toString config_file;
        X_FITNESS_HOST = cfg.host;
        X_FITNESS_PORT = toString cfg.port;
        X_FITNESS_PASSWORD_HASH_FILE = "%d/password-hash";
      };

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        DynamicUser = true;
        StateDirectory = "x-fitness";
        StateDirectoryMode = "0700";
        LoadCredential = [ "password-hash:${cfg.passwordHashFile}" ];
        Restart = "always";
        RestartSec = "5s";

        CapabilityBoundingSet = "";
        LockPersonality = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectSystem = "strict";
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        SystemCallArchitectures = "native";
        SystemCallFilter = [ "@system-service" ];
        UMask = "0077";
      };
    };

    networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];
  };
}
