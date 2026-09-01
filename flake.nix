{
  description = "ori (織) — DDD-driven feature scaffolding with CoDD coherence + per-feature TDD";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      # apm-cli (nixpkgs) は upstream の pyproject.toml が依存に `websockets` を宣言しているのに
      # nixpkgs の dependencies から漏れており、pythonRuntimeDepsCheckHook でビルドに失敗する。
      # そのため依存を補ってビルドするためのオーバーレイを当てる（nixpkgs 側の修正が入るまでの暫定対応）。
      apmCliOverlay = final: prev: {
        apm-cli = prev.apm-cli.overridePythonAttrs (old: {
          dependencies = (old.dependencies or []) ++ [ final.python3Packages.websockets ];
        });
      };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ apmCliOverlay ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            apm-cli
          ];
        };
      });
}
