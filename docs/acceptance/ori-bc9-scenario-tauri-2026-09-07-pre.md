# scenario 実行モデル tauri stack acceptance — 2026-09-07 prep (ori-bc9.5)

`ori-bc9.5` のうち **typescript-tauri stack** (local mode / build-then-test / WDIO) の
session acceptance の **prep log**。run session は本 log の手順に従って別 session で
実施する (実行環境の構築コストが大きいため分離。慣行の 2-session pattern)。

## 環境評価 (2026-09-07 実施)

| 項目 | 結果 |
|---|---|
| OS | NixOS (nix 2.34.8, nixpkgs 26.11 via NIX_PATH) |
| `webkitgtk_4_1` (tauri 2.x Linux webview) | nixpkgs に存在 ✓ |
| `tauri-driver` | **nixpkgs に存在しない** → `cargo install tauri-driver` で供給 |
| rust toolchain | `nix shell nixpkgs#cargo` で即時解決 (cargo 1.97.0) ✓ |
| node / pnpm | 22.23.2 / 10.33.2 ✓ |
| playwright chromium (compose-service 系混在 scenario 用) | shared libs を `lib.makeLibraryPath` で解決 (TS acceptance log E-1 と同じ手法 — devShell に包含) |

前提の実在性確認: `@wdio/tauri-service` は npm に存在 (v1.4.0) — recipe の package 名は正しい。

## devShell 手順 (D7: WebKitGTK + tauri-driver の nix devShell 化)

acceptance 用 test dir に以下の `shell.nix` を置き、`nix-shell` 内で全作業を行う:

```nix
# shell.nix — tauri scenario acceptance 用 devShell (ori-bc9.5)
{ pkgs ? import <nixpkgs> {} }:
let
  browserLibs = with pkgs; [
    glib nss nspr atk at-spi2-atk cups libdrm libxkbcommon mesa pango cairo
    alsa-lib dbus libX11 libXcomposite libXdamage libXext libXfixes libXrandr
    libxcb expat libgbm
  ];
in
pkgs.mkShell {
  packages = with pkgs; [
    nodejs_22
    rustc cargo rustfmt clippy
    pkg-config
    webkitgtk_4_1
    glib gtk3 libsoup_3 javascriptcoregtk_4_1
  ] ++ browserLibs;

  # playwright chromium (download 済み binary) が NixOS で shared libs を解決できるように
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath browserLibs;

  shellHook = ''
    # tauri-driver は nixpkgs に無いため cargo install で供給 (初回のみ、~ 数分)
    if ! command -v tauri-driver >/dev/null 2>&1; then
      echo "NOTE: cargo install tauri-driver を実行していない場合は先に実行すること"
    fi
    echo "tauri scenario acceptance devShell ready"
  '';
}
```

補足:

- tauri app の cargo build は `nix-shell` 内で実施 (webkitgtk_4_1 の pkg-config 解決のため)
- `tauri build --debug --no-bundle` の binary は runtime も webkitgtk 系 libs を要求する —
  devShell の `LD_LIBRARY_PATH` が cover する想定。不足が出たら `makeLibraryPath` の対象を追加
- tauri-driver は WebDriver server として port 4444 で起動し、WDIO が接続する

## run session で実施する E-steps (計画)

| # | Step | 実行内容 (想定) |
|---|---|---|
| E-1 | tauri app fixture 構築 | test dir に `pnpm tauri init` 相当の最小 tauri 2.x app (window に固定文字列を表示) を作成 |
| E-2 | devShell 起動 + toolchain 確認 | `nix-shell` 内で `cargo install tauri-driver` (初回) + `rustc --version` |
| E-3 | architecture.md 生成 | `workspace.apps[].runtime` = local (`build: pnpm tauri build --debug --no-bundle`, `binary: apps/<app>/src-tauri/target/debug/<app>`, `target: host`, `runner: wdio`) + `scenario_test_runner: {runner: wdio}` |
| E-4 | scenario manifest | `infrastructure.services: [<tauri-app>, postgres]` — **local app + infra 混在** (local app は compose に含まれないことの検証含む) |
| E-5 | derive | runner chain: チェーン 2 (参加 local 系 app の `runtime.runner` = **wdio**) で解決されること |
| E-6 | generate | `generate-docker-compose.sh` — compose には postgres のみ (local app は NOTE 付きで除外) / `tests/*.spec.ts` + `wdio.conf.ts` (`tauri:options.application` = runtime.binary, services: ['tauri']) / runner deps (`@wdio/cli @wdio/local-runner webdriverio @wdio/tauri-service`) |
| E-7 | build-then-test | `pnpm tauri build --debug --no-bundle` → binary 生成確認 |
| E-8 | review | tsc / mode 別 checklist (local 系: compose に local app 無し、wdio.conf の binary 一致、tauri-service あり) |
| E-9 | E2E 実行 | `tauri-driver` 起動 + WDIO 実行 → **WDIO screenshot を証跡として保存** (grep-able な UI assertion) |
| E-10 | finalize | status.yaml |

## 実施上の注意 (TS acceptance からの転用)

- compose 側は TS acceptance と同一 pattern (`up -d --wait` + teardown で down)
- WDIO 側の lifecycle: `onPrepare` (compose up + tauri-driver 起動) / `onComplete` (down)。
  playwright の F-5 教訓 (CLI が終了する起動方式は process kill に依存しない) を踏襲
- CI 自動化 (WebKitGTK + xvfb + tauri-driver 入り Docker image) は scope 外 (`ori-7c1`)

## 状態

**prep 完了** — run session は未実施。`ori-bc9.5` の tauri 側完了条件 (acceptance log PASS +
WDIO screenshot 証跡) は run session で満たす。
