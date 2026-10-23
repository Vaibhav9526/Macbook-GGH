# Jargon from its GitHub release: the AppImage on Linux and the app ZIP on macOS. `sources.json`
# names the release and its hashes; `bun scripts/nix-sources.ts` writes it after each release.
#
# Jargon does not update itself from the Nix store (`isNixStoreInstall` in
# src/main/update-service.ts). Nix replaces the whole package instead.
{
  lib,
  stdenvNoCC,
  fetchurl,
  appimageTools,
  buildFHSEnv,
  makeBinaryWrapper,
  unzip,
  sources,
}:

let
  pname = "jargon";
  inherit (sources) version;
  system = stdenvNoCC.hostPlatform.system;
  asset = sources.assets.${system} or (throw "Jargon has no release for ${system}");

  src = fetchurl {
    url = "https://github.com/Vaibhav9526/jargon/releases/download/v${version}/${asset.name}";
    inherit (asset) hash;
  };

  meta = {
    description = "Local-first multi-agent desktop workspace for Codex, Claude, Grok and other coding agents";
    homepage = "https://github.com/Vaibhav9526/jargon";
    changelog = "https://github.com/Vaibhav9526/jargon/releases/tag/v${version}";
    license = {
      shortName = "unlicensed";
      fullName = "proprietary license";
      spdxId = "UNLICENSED";
      url = "https://github.com/Vaibhav9526/jargon";
      free = false;
      redistributable = false;
    };
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    platforms = builtins.attrNames sources.assets;
    mainProgram = "jargon";
  };

  # The AppImage's `AppRun` adds `--no-sandbox` when the system refuses an unprivileged user
  # namespace, and its desktop entry passes `--no-sandbox` too. Jargon must keep the Electron sandbox
  # (build/linux/jargon.apparmor), so the FHS environment starts the Electron binary directly.
  # Its libraries and the bundled cua-driver find the usual Linux paths there.
  contents = appimageTools.extract {
    inherit pname version src;
    # The bundled Sunshine needs libminiupnpc.so.17, which nixpkgs does not have. Without the runtime
    # directory, Jargon shows remote desktop as unavailable and does not try to start it.
    postExtract = ''
      rm -rf $out/resources/remote-desktop-runtime
    '';
  };

  linux = buildFHSEnv (
    appimageTools.defaultFhsEnvArgs
    // {
      inherit pname version meta;
      targetPkgs = pkgs: appimageTools.defaultFhsEnvArgs.targetPkgs pkgs ++ [ pkgs.libsecret ];
      runScript = "${contents}/jargon";
      extraInstallCommands = ''
        install -Dm444 ${contents}/jargon.desktop $out/share/applications/jargon.desktop
        substituteInPlace $out/share/applications/jargon.desktop \
          --replace-fail 'Exec=AppRun --no-sandbox %U' 'Exec=jargon %U'
        # The AppImage has only a 1600x1600 icon, a size that no icon theme lists.
        install -Dm444 ${contents}/jargon.png $out/share/pixmaps/jargon.png
      '';
    }
  );

  darwin = stdenvNoCC.mkDerivation {
    inherit
      pname
      version
      src
      meta
      ;

    nativeBuildInputs = [
      makeBinaryWrapper
      unzip
    ];

    sourceRoot = ".";

    # The app is signed and notarized. Stripping or patching it would break the signature.
    dontConfigure = true;
    dontBuild = true;
    dontFixup = true;

    installPhase = ''
      runHook preInstall
      mkdir -p $out/Applications
      cp -R Jargon.app $out/Applications/
      makeWrapper $out/Applications/Jargon.app/Contents/MacOS/Jargon $out/bin/jargon
      runHook postInstall
    '';
  };
in
if stdenvNoCC.hostPlatform.isDarwin then darwin else linux
