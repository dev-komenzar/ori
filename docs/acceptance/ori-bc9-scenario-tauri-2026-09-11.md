# scenario 実行モデル tauri stack acceptance — 2026-09-11 run (ori-bc9.5)

`ori-bc9` (scenario 実行モデルの一般化) の child 5 のうち **typescript-tauri stack**
（local mode / build-then-test / WDIO）の session acceptance **run log**。
prep log（`ori-bc9-scenario-tauri-2026-09-07-pre.md`）で手順化した E-step を実行し、
run-mode 抽象（local app は compose に含めない）・runner chain（チェーン 2 で wdio 解決）・
generate I/O（compose は postgres のみ / wdio.conf 生成）・WDIO lifecycle（onPrepare/onComplete）
を greenfield で実証した。

## Test environment

| 項目 | 値 |
|---|---|
| greenfield root | `/tmp/ori-acceptance-bc9-tauri` |
| ori 本体 branch | `task/ori-bc9-scenario-run-model` |
| OS | NixOS (nix 2.34.8, nixpkgs 26.11) + niri Wayland + Xwayland `:0`（実ディスプレイ） |
| rust toolchain | cargo 1.97.0 / rustc 1.97.1（`nix-shell` devShell 経由） |
| node / pnpm | 22.23.2 / 11.22.0（nix-shell 内 corepack 解決。host は 10.33.2） |
| webview | webkit2gtk-4.1 = 2.52.5（`WebKitWebDriver` は `webkitgtk_4_1` の `bin/`） |
| tauri-driver | v2.0.6（nixpkgs 外 → `cargo install tauri-driver --locked`） |
| runner | `@wdio/tauri-service` 1.4.0 + webdriverio 9.31.7 + `@wdio/mocha-framework` 9.31.7 |
| docker | 29.7.2 + compose 5.4.0 |
| target app | `apps/tauriapp`（tauri 2.x vanilla-ts、window に固定文字列 `tauriapp is up` を表示） |
| target scenario | `tauriapp-e2e`（local app `tauriapp` + infra `postgres` 混在） |

## Steps (E-N)

| # | Step | 実行内容 | Result |
|---|---|---|---|
| E-1 | app fixture 構築 | `pnpm create tauri-app@latest tauriapp --template vanilla-ts --manager pnpm --identifier com.ori.acceptance --yes` → `apps/tauriapp`（@tauri-apps/cli 2.11.4 / api 2.11.1）。`index.html`/`src/main.ts` を固定文字列 `tauriapp is up` 表示に最小化 | OK |
| E-2 | devShell + toolchain | test dir に `shell.nix` 配置 → `nix-shell` 内で `cargo install tauri-driver --locked`（v2.0.6）→ `rustc --version`（1.97.1）+ `pkg-config --modversion webkit2gtk-4.1`（2.52.5） | OK |
| E-3 | architecture.md 生成（architect 相当）+ lint | `workspace.apps[].runtime` = local（`build: pnpm tauri build --debug --no-bundle` / `binary: apps/tauriapp/src-tauri/target/debug/tauriapp` / `target: host` / `runner: wdio`）+ `scenario_test_runner: {runner: wdio}` + multi-root（ts/rs）→ `node .apm/skills/ori-doctor/scripts/lint.js .ori` | OK — lint clean（golden fixture 準拠、本文 H2 に `{#id}` anchor 付与で g-8 PASS） |
| E-4 | domain docs + scenario manifest | `.ori/domain/workflows/index.md#tauriapp-startup-steps` + `.ori/domain/validation.md#tauriapp-happy-path`（Gherkin）+ `.ori/scenarios/tauriapp-e2e/manifest.yaml`（`infrastructure.services: [tauriapp, postgres]`、`runner:` なし） | OK |
| E-5 | **derive** (phase 1) | `check-scenario-exists.sh tauriapp-e2e`（exit 0）→ `resolve-upstream.sh`（2 upstream + hash）→ runner chain 解決（manifest `runner:` なし / 参加 `tauriapp` が local 系で `runtime.runner` = **wdio** → **チェーン 2**）→ `spec.md` + `validation.md`（scenario ローカル）生成 | OK |
| E-6 | **generate** (phase 2) | `generate-docker-compose.sh tauriapp-e2e` → **tauriapp は local で除外（NOTE）・postgres のみ** + `docker compose config -q` PASS / runner deps を root `package.json` に追加（`@wdio/cli @wdio/local-runner webdriverio @wdio/tauri-service @wdio/mocha-framework @wdio/spec-reporter @wdio/globals @types/mocha @types/node`）/**F-1 F-2 を検出・修正** / `tests/tauriapp-e2e.spec.ts` + `wdio.conf.ts` + `tsconfig.json` 生成 | OK |
| E-7 | build-then-test | `pnpm tauri build --debug --no-bundle` → binary 生成（**1m 58s**、16 core） | OK |
| E-8 | **review** (phase 3) | `tsc -p .ori/scenarios/tauriapp-e2e --noEmit` PASS / `docker compose config -q` PASS / mode 別 checklist（local app は compose 不在 / wdio.conf binary 一致 / tauri-service あり）→ `review.md` verdict=PASS | OK |
| E-9 | E2E 実行 | `pnpm exec wdio run wdio.conf.ts`（`driverProvider: 'external'` → tauri-driver → WebKitWebDriver → app）→ **2 passing (11.3s)**（`#app-message` = "tauriapp is up" / postgres TCP probe）+ **WDIO screenshot 証跡**保存 | **OK — 2 passed** |
| E-10 | **finalize** (phase 4) | `status.yaml` `dirty: []` + review PASS を記録 | OK |

## Acceptance criteria (epic ori-bc9 の検収条件、tauri 側)

| # | criterion | Result |
|---|---|---|
| 1 | `local` 系 app（tauri）と infra が混在する scenario を schema 上表現でき、generate が正しく処理する | ✓（`workspace.apps[].runtime` mode=local [AppRuntimeSchema] + manifest `infrastructure.services: [tauriapp, postgres]` → compose は postgres のみ） |
| 2 | runner chain（D4）が derive で解決され spec.md に記録される | ✓（チェーン 2 = 参加 local 系 app の `runtime.runner` = wdio、spec.md 実装ノートに記録） |
| 3 | build-then-test: E2E はビルド済み binary に対して実行（テストコードに build/起動なし） | ✓（`pnpm tauri build --debug --no-bundle` の binary を `tauri:options.application` で指定。lifecycle は wdio.conf の onPrepare/onComplete） |
| 4 | local 系 app は docker-compose に含めない（compose は compose-service 系 + infra のみ） | ✓（generate が `NOTE: tauriapp: runtime.mode=local (build-then-test。compose には含めない)` を出力、compose は postgres のみ） |
| 5 | runner deps が root package.json に追加される（D5） | ✓（@wdio/cli / @wdio/local-runner / webdriverio / @wdio/tauri-service + framework 群） |
| 6 | healthcheck: TCP probe default（infra は image family 別翻訳） | ✓（postgres `pg_isready`、`docker compose up -d --wait` で起動待機） |
| 7 | scenario 4-phase（derive → generate → review → finalize）が新実行モデルで通る | ✓（E-5〜E-10） |
| 8 | WDIO screenshot 証跡 | ✓（`.ori/scenarios/tauriapp-e2e/screenshots/tauriapp-window.png` — "tauriapp is up" 表示を視覚確認） |

## Friction

| # | 内容 | 対応 |
|---|---|---|
| F-1 | generate SKILL.md の wdio.conf.ts example が `@wdio/tauri-service` v1.4.0 の実 API と乖離（`browserName: 'tauri'` / `driverProvider: 'external'` / `framework: 'mocha'` 欠落。v1.4.0 の default は `embedded` で、これは `tauri-plugin-wdio-webdriver` を app に要求する）。あわせて architect SKILL.md の `runner_deps`（typescript-tauri）に `@wdio/mocha-framework` `@wdio/spec-reporter` `@wdio/globals` `@types/mocha` が不足し、generate 後の tsc/実行が失敗する | **修正済み**: generate SKILL.md（wdio example + tsconfig）+ architect SKILL.md（runner_deps）を実 API に整合 |
| F-2 | WDIO v9 の型（`@wdio/globals/types` + expect-webdriverio）が TypeScript 7.0 の lib.dom（`URLPattern`）と衝突し、生成物の `tsc --noEmit` が失敗する。scenario tsconfig に `skipLibCheck: true` + `types: ["node","@wdio/globals/types","mocha"]` が必要 | **修正済み**: generate SKILL.md の scenario tsconfig SSoT に反映 |
| F-3 | prep log の shell.nix に記載した `javascriptcoregtk_4_1` は nixpkgs に存在しない（JSC は `webkitgtk_4_1` に同梱）。また Linux の `external` provider は「WDIO → tauri-driver（intermediary, :4444）→ WebKitWebDriver（native）→ app」の 3 段構成で、`WebKitWebDriver` が PATH に必要（`webkitgtk_4_1` の `bin/` が供給）。prep log の「tauri-driver が WebDriver server として起動」は intermediary の位置づけとして正確化が必要 | **carry-over**: 環境手順（prep log D7）の記述修正。コード変更なし |

## 証跡

- E2E 実行結果（最終 run）: `2 passing (11.3s)` —
  `step 1 — validation#tauriapp-happy-path (window text)`（`getElementText` → `tauriapp is up`）/
  `step 2 — validation#tauriapp-happy-path (postgres TCP)`
- WDIO screenshot: `.ori/scenarios/tauriapp-e2e/screenshots/tauriapp-window.png`（27988 bytes、"tauriapp is up" + "scenario 実行モデル acceptance fixture (ori-bc9.5)" を表示）
- run 後 `docker ps` — scenario 由来 container なし（onComplete の `down -v --remove-orphans` 確認、`tauriapp-e2e_default` network も除去）
- 生成物: `.ori/scenarios/tauriapp-e2e/{manifest.yaml, spec.md, validation.md, tests/tauriapp-e2e.spec.ts, wdio.conf.ts, tsconfig.json, docker-compose.yml, review.md, status.yaml, screenshots/tauriapp-window.png}`
- devShell: `shell.nix`（D7 — WebKitGTK + tauri-driver の nix devShell 化、`javascriptcoregtk_4_1` 除去済み、`PATH` に `~/.cargo/bin` 追加）

## 結論

**PASS** — typescript-tauri stack について scenario 実行モデル（local mode の
build-then-test・runner chain チェーン 2・generate の local 除外・WDIO lifecycle 所有）が
4-phase 通しで動作することを実証した。friction 3 件のうち 2 件を場で修正（SKILL.md）、
1 件を環境手順の carry-over とした。WDIO screenshot 証跡も取得済み。

### 補足（ori 非欠陥、記録のため）

- unit test: 全 package GREEN。ただし `packages/skills/ori-init` の
  「`bd` not on PATH」テストのみ本環境で失敗（`bd` が nix store と `~/.nix-profile/bin` の
  二重に PATH 上に存在し、テストの `pathWithoutBd()` が 1 箇所しか除去しないため）。
  環境起因の既存テストで、本 acceptance の変更（SKILL.md doc）とは無関係。
