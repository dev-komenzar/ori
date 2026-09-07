# scenario 実行モデル TS stack acceptance — 2026-09-07 (ori-bc9.5)

`ori-bc9` (scenario 実行モデルの一般化) の child 5 のうち **typescript stack** の
session acceptance 実行 log。run-mode 抽象 (compose-service + infra 混在)・
runner chain 解決・generate I/O・runner config 所有 lifecycle を greenfield で実証した。

> 慣行の 2-session pattern について: 本 acceptance は OpenCode session 内で skill scripts を
> test dir に配置して実施したため skill-registry timing 問題が発生しない。prep / run の
> 分離は不要と判断し 1-session で完走した (成果物は同一)。

## Test environment

| 項目 | 値 |
|---|---|
| greenfield root | `/tmp/ori-acceptance-bc9-ts` |
| ori 本体 branch | `task/ori-bc9-scenario-run-model` |
| toolchain | node 22.23.2 / pnpm 10.33.2 / docker 29.7.2 + compose 5.4.0 |
| runner | playwright 1.63.0 + chromium headless shell 153.0.8010.12 (headless) |
| target app | `apps/healthapp` (zero-dep node server — 後述の環境制約 E-2) |
| target scenario | `app-health-e2e` (compose-service app + infra postgres 混在) |
| OS | NixOS (browser shared libs は `lib.makeLibraryPath` で解決 — 後述 E-1) |

### 環境による制約 (ori 非欠陥、記録のため)

- **E-1 (NixOS / browser libs)**: playwright の download 済み chromium が FHS 無し環境で
  shared libraries を解決しない (`libglib-2.0.so.0` 等)。
  `nix eval --impure --expr '... lib.makeLibraryPath [ glib nss ... libgbm ]'` で得た
  store path 群を `LD_LIBRARY_PATH` に指定して解決。tauri 側の devShell 手順に包含する (prep log 参照)。
- **E-2 (sandbox container egress block)**: 本環境の docker container から
  `registry.npmjs.org` への egress が block されているため、CI smoke が検証する正規 recipe
  (`corepack enable && pnpm install --frozen-lockfile`) の container 内実行が不可能。
  よって acceptance の app は zero-dep node server とし runtime block の `install` を省略
  (schema 上 optional)。**正規 pnpm recipe の実在性は CI smoke
  (`ci/scenario-smoke/`, workflow `scenario-smoke.yml`) が open network な CI で毎 PR 検証する**
  — 本 acceptance は flow (4-phase + lifecycle) の実証に特化した分業。

## Steps (E-N)

| # | Step | 実行内容 | Result |
|---|---|---|---|
| E-1 | `.ori/` scaffold | `create-skeleton.sh --dest /tmp/ori-acceptance-bc9-ts --app-name healthapp --agent opencode` | OK — `.ori/` + `.beads/` + `.claude/` integration 生成。**`scenarios/` dir が生成されない** → F-2 |
| E-2 | app fixture | `apps/healthapp` (package.json + server.mjs, port 5173) | OK |
| E-3 | architecture.md 生成 (architect 相当) + self-check | `workspace.apps[].runtime` (mode: compose-service, image: node:22-slim, run: node server.mjs, ports: [5173]) + invariants layer graph + `scenario_test_runner: {runner: playwright}` + decisions 記録 → `node .apm/skills/ori-doctor/scripts/lint.js .ori` | OK — lint clean (本文 H2 に `{#decisions}` anchor 追与で PASS) |
| E-4 | domain docs + scenario manifest | `.ori/domain/workflows.md` (#app-health-steps) + `validation.md` (Gherkin: app-health-happy-path) + `.ori/scenarios/app-health-e2e/manifest.yaml` (`infrastructure.services: [healthapp, postgres]`) | OK |
| E-5 | **derive** (phase 1) | `check-scenario-exists.sh app-health-e2e` (exit 0) → `resolve-upstream.sh` (**scenario 非対応を検出 → F-3 修正**、2 upstream 解決 + hash) → runner chain 解決 (manifest `runner:` なし / compose-service 系のみで local 導出なし / global `scenario_test_runner.runner` = **playwright、チェーン 3**) → `spec.md` + `validation.md` 生成 (runner 記録込み) | OK |
| E-6 | **generate** (phase 2) | `generate-docker-compose.sh app-health-e2e` → healthapp (runtime block から) + postgres (infra catalog から、pg_isready healthcheck) の compose 生成 + `docker compose config -q` PASS / runner deps を root `package.json` に追加 (`pnpm add -D @playwright/test @types/node`) / `tests/app-health-e2e.spec.ts` + `playwright.config.ts` + `teardown.mjs` + `tsconfig.json` 生成 (**F-5 / F-6 を検出・修正しながら生成 pattern を確定**) | OK |
| E-7 | **review** (phase 3) | `tsc -p .ori/scenarios/app-health-e2e` PASS / `docker compose config -q` PASS / mode 別 checklist (spec ↔ config ↔ compose 整合) → `review.md` verdict=PASS | OK |
| E-8 | E2E 実行 | `playwright test` (webServer が `docker compose up -d --wait` を起動、globalTeardown が `down -v`) → headless chromium で app HTTP + postgres TCP probe | **OK — 2 passed (1.5s)** / run 後 containers・network 完全除去を確認 |
| E-9 | **finalize** (phase 4) | `status.yaml` `dirty: []` + review PASS を記録 | OK |

## Acceptance criteria (epic ori-bc9 の検収条件、TS 側)

| # | criterion | Result |
|---|---|---|
| 1 | compose-service app + infra が混在する scenario を schema 上表現でき、generate が正しく処理する | ✓ (`workspace.apps[].runtime` [WorkspaceSchema] + manifest `infrastructure.services` → compose 生成) |
| 2 | runner chain (D4) が derive で解決され spec.md に記録される | ✓ (チェーン 3 = global `scenario_test_runner.runner` で playwright 解決、spec.md 実装ノートに記録) |
| 3 | compose / driver lifecycle を runner config が所有する (テストコードに起動処理なし) | ✓ (webServer + globalTeardown。**F-5 で不正 pattern を検出し正規 pattern を確定**) |
| 4 | runner deps が root package.json に追加される (D5) | ✓ (`@playwright/test` + `@types/node`) |
| 5 | build-then-test: E2E はビルド済み artifact (起動済み service) に対して実行 | ✓ (compose up → url 待機 → test) |
| 6 | healthcheck: TCP probe default (infra は image family 別翻訳) | ✓ (postgres `pg_isready`、app は config `url` 待機) |
| 7 | scenario 4-phase (derive → generate → review → finalize) が新実行モデルで通る | ✓ (E-5〜E-9) |
| 8 | (CI smoke) 正規 recipe (corepack + pnpm) の descriptor 実在性を毎 PR ガード | ✓ (`ci/scenario-smoke/` + `scenario-smoke.yml` 導入。sandbox では `ORI_SMOKE_SKIP_COMPOSE=1` で生成 + config 検証まで PASS、full leg は CI で) |

## Friction

| # | 内容 | 対応 |
|---|---|---|
| F-1 | runtime recipe `install: pnpm install --frozen-lockfile` は `node:22-slim` 上で pnpm 不在により起動しない (descriptor 実在性 bug — smoke が検出すべき類) | **修正済み**: golden fixture + architect SKILL recipe を `corepack enable && pnpm install --frozen-lockfile` に更新 |
| F-2 | `create-skeleton.sh` が `.ori/scenarios/` を作らない (design.md §17 の per-project tree に含まれる) | **carry-over** (bd: ori-335) |
| F-3 | `resolve-upstream.sh` が `.ori/slices/` 固定で scenario manifest を解決できない (derive scenario workflow 手順 4 が依存) | **修正済み**: slices → scenarios の fallback を追加 |
| F-4 | golden fixtures の本文 `## Decisions` が `{#id}` anchor 無し (doctor lint の H2 anchor rule と不整合 — 本 acceptance の architecture.md は anchor 付きで生成すれば clean) | **carry-over** (bd: ori-3zl) |
| F-5 | 生成した playwright config に存在しない `webServer.teardown` option を使っていた (TS2769 で検出)。かつ `docker compose up --wait` は healthy 後に CLI が終了するため process kill では compose が停止しない | **修正済み**: 正規 pattern = `up -d --wait` + `globalTeardown` で明示 `down -v`。SKILL.md example を更新 |
| F-6 | 生成物の `tsc --noEmit` が node types / esnext target なしで失敗する | **修正済み**: scenario 直下に `tsconfig.json` を出力するよう SKILL.md に追加 |

## 証跡

- E2E 実行結果 (最終 run): `2 passed (1.5s)` —
  `step 1 — validation#app-health-happy-path (app HTTP)` /
  `step 2 — validation#app-health-happy-path (postgres TCP)`
- run 後 `docker ps` — containers なし (globalTeardown による `down -v` 確認)
- 生成物: `.ori/scenarios/app-health-e2e/{manifest.yaml, spec.md, validation.md, tests/app-health-e2e.spec.ts, playwright.config.ts, teardown.mjs, tsconfig.json, docker-compose.yml, review.md, status.yaml}`
- test dir bd: `acceptance: app-health-e2e scenario 4-phase (ori-bc9.5)` を起票

## 結論

**PASS** — typescript stack について scenario 実行モデル (run-mode 抽象・runner chain・
generate I/O・lifecycle config 所有) が 4-phase 通しで動作することを実証した。
friction 6 件のうち 4 件を場で修正、2 件を carry-over した。
tauri stack (local mode) は prep log を参照 (run session は別 issue で追跡)。
