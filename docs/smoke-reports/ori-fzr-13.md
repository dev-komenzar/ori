---
ori:
  node_id: smoke-report:ori-fzr-13
  type: smoke-report
  version: 1.0.0
  run_at: 2026-06-26
  run_by: dev-komenzar (Claude Opus 4.7)
  scope: ori-fzr epic (Slice DoD enforcement via test contract)
---

# ori-fzr.13 — Integration Smoke Report

## TL;DR

- **Structural smoke (scaffolding + config + sweep heuristics): PASS**
- **Runtime smoke (cargo + tauri-cli を要する phase 5-8): DEFERRED** — env に cargo が無く、`/ori-flow` slash skill を agent 直接 invoke できないため
- **Bugs found: 2 (filed as ori-fzr.14, ori-fzr.15)**
- **Process gap filed: 1 (ori-fzr.16 — CI smoke driver)**
- **Conclusion**: ori-fzr.1〜12 で実装した Slice DoD enforcement の **静的成果物 (template / schema / sweep script)** は fresh project 上で期待通り動作する。**動的成果物 (specta rebuild → RED → GREEN 移行)** は env 完備の追試で確認すべし

## Environment

- working dir: `/tmp/ori-fzr-13-smoke` (fresh, non-git)
- node: 22.22.2 — present
- pnpm: 10.33.4 — present
- cargo: **absent** (Nix env に未 install)
- bd: present
- ori bundle: source @ `/home/takuya/ghq/github.com/dev-komenzar/ori/.apm/skills/`

## Verified steps

| # | step | status | evidence |
| --- | --- | --- | --- |
| 1 | `bash .apm/skills/ori-init/scripts/create-skeleton.sh --dest /tmp/ori-fzr-13-smoke --app-name notes` | **PASS** | `.ori/` skeleton 12 domain scaffolds + config.yaml(app=notes, current_agent=claude) + .gitignore 出力、bd init 成功 |
| 2 | `node .apm/skills/ori-arch/scripts/render-architecture.js --pattern ddd-vsa-hex --stack typescript-tauri --bc note-taking` | **PASS** | `.ori/architecture.md` 出力、frontmatter に `cross_root` / `sub_layers` (TS + Rust) / `phase_hooks` block 全て含有 (ori-fzr.2 / ori-fzr.11 成果が end-to-end で reflected) |
| 3 | `install-tauri-scaffold.sh` — pre-condition (src-tauri 無し) error path | **PASS** | exit 2 + helpful message `run 'pnpm tauri init' inside .../apps/notes first.` |
| 4 | `install-tauri-scaffold.sh` — `pnpm tauri init` simulation 後 | **PASS** | `src-tauri/src/bin/export-types.rs` / `apm-scripts/specta-build.sh` / `src/note-taking/shared/test-fixtures/setupProductionBuilder.ts` / `src/note-taking/shared/ipc/.gitkeep` 配置、cargo 不在で deps は manual fallback 指示出力 |
| 5 | placeholder 置換 verify | **PARTIAL** | `setupProductionBuilder.ts` / `specta-build.sh` は全 substituted。**`export-types.rs:13` に `{{BC_NAME}}` literal 残置** → ori-fzr.14 |
| 6 | slice manifest 作成 (`expected_deliverables` schema) | **PASS** | `.ori/slices/create-note/manifest.yaml` を手動作成、ori-fzr.4 で defined schema (sub_layers / boundary / production_fixture / cross_root_contracts) を満たす |
| 7 | `check-dod-sweep.sh` (PROJECT_ROOT auto-detect) | **FAIL** | bare invocation で ori repo root を選び user project の `.ori/` が見えない → ori-fzr.15 |
| 8 | `check-dod-sweep.sh --project-root /tmp/ori-fzr-13-smoke` | **PASS** | 5 rule:dod-1 violation を空 slice に対し正しく検出、`apps/.../<layer>` / `<layer>.rs` の dual check 動作確認、exit=1 |

## Deferred steps (need cargo + tauri-cli + skill driver)

| # | step | reason |
| --- | --- | --- |
| 9 | `/ori-flow create-note` で 7-phase 通し駆動 | `/ori-flow` slash skill は user-typed; agent から直接 invoke 不可。各 phase の SKILL.md 読込みで指示確認のみ |
| 10 | `/ori-impl-red` で stub commands.rs + bindings.ts + boundary test emit、runtime RED 確認 | cargo 不在で specta rebuild 不可、`pnpm tauri init` も network 要 |
| 11 | `/ori-impl-green` で real impl + production wiring + specta rebuild → GREEN 確認 | cargo 必須 |
| 12 | `/ori-review` で 0 DoD violation を確認 | green 実装が前提 |
| 13 | `--dod-sweep --emit-issues` で bd issue auto-emit + idempotent 確認 | 違反 issue を実 bd に作るので production smoke と切り分けるべき |

→ deferred steps の整理は ori-fzr.16 (CI smoke driver 設計) で fold.

## Findings (filed as follow-ups)

### ori-fzr.14 — P3 / bug

`export-types.rs.tpl` line 13 comment に jinja-style `{{BC_NAME}}` が残っており、`install-tauri-scaffold.sh` の sed sentinel (`__BC_NAME__`) substitution で置換されない。直し方は単純 (`{{BC_NAME}}` → `__BC_NAME__` 統一)。runtime には影響しない (comment) が、テンプレ規約整合性を保つため修正。

### ori-fzr.15 — P2 / bug

`check-dod-sweep.sh` の PROJECT_ROOT auto-detect が `git -C "$SCRIPT_DIR" rev-parse --show-toplevel` を使うため、ori bundle が install されている user project から **bare bash invocation** すると **ori repo root** が選ばれて user project の `.ori/` を見ない。`--project-root` 明示で回避可。同パターンは run-checks.sh / 他の check-*.sh にもあり横展開での修正が望ましい。

### ori-fzr.16 — P2 / task

ori-fzr.13 では cargo / tauri-cli 不在 + skill driver の不在で phase 5-8 を full E2E できなかった。Docker image (cargo + pnpm + tauri-cli) で `/ori-flow` を non-interactive 駆動する **CI smoke** スクリプトを作るのが筋。

## Conclusion

ori-fzr.1〜12 で実装した DoD 関連の **静的成果物 (pattern.md normative / stack template / SSoT instructions / scaffold script / sweep script)** は fresh project 上で **配置 / レンダリング / 規約整合性 / sweep heuristics** が期待通り動作した。残 bug は 2 件で軽微 (comment leftover / auto-detect 範囲)、いずれも自動 fix 可能で機能本体には影響しない。

ori-fzr epic の P1 child は ori-fzr.13 を含め全 close、P2 残務は smoke-followup 3 件 (ori-fzr.14/15/16) として継続管理する。

## Reproduction

```bash
# 0. tools
command -v node pnpm bd   # cargo は optional (manual fallback あり)

# 1. fresh dir
rm -rf /tmp/ori-fzr-13-smoke && mkdir /tmp/ori-fzr-13-smoke

# 2. /ori-init
bash <ori-root>/.apm/skills/ori-init/scripts/create-skeleton.sh \
  --dest /tmp/ori-fzr-13-smoke --app-name notes

# 3. /ori-arch render
cd /tmp/ori-fzr-13-smoke
node <ori-root>/.apm/skills/ori-arch/scripts/render-architecture.js \
  --pattern ddd-vsa-hex --stack typescript-tauri --bc note-taking

# 4. simulate pnpm tauri init (real env: pnpm tauri init を打つ)
mkdir -p apps/notes/src-tauri/src apps/notes/src
# ... minimal Cargo.toml / lib.rs / main.rs ...

# 5. specta scaffold
bash <ori-root>/.apm/skills/ori-init/scripts/install-tauri-scaffold.sh \
  --dest /tmp/ori-fzr-13-smoke --app-name notes --bc-name note-taking

# 6. DoD sweep
bash <ori-root>/.apm/skills/ori-doctor/scripts/check-dod-sweep.sh \
  --project-root /tmp/ori-fzr-13-smoke
```
