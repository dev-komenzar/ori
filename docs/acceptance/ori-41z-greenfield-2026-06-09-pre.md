# ori-41z greenfield acceptance — 2026-06-09 prep (v0.3 Phase H4b)

`ori-s44` (PR #32) で deferred とした完了条件 ③ 「AI が `/ori-flow new-slice` で
example-slice/ を on-demand 参照して slice を生成できる」を greenfield で end-to-end
検証する acceptance の **準備セッション** ログ。

`skill-registry-load-timing-2026-06-03` memory の制約により、本セッションで
apm install + ori 初期化までを行い、`/ori-flow new-slice` 起動は **別セッション**
で実施する 2-session pattern (memory: `feedback_acceptance_2session_pattern`) を採用。

## Scope

本 pre セッションは greenfield の構築までで、検証本体は別セッションで実施する。

- 本セッション (prep)
  - greenfield directory 作成
  - `apm install dev-komenzar/ori`
  - `/ori-init` 相当 (`bash .claude/skills/ori-init/scripts/create-skeleton.sh`)
  - `.ori/domain/*.md` への最小限ドメイン書き込み (`bookmark-keeping` BC)
  - `/ori-arch` 相当 (upstream vite init + `render-architecture.js`)
  - 本ドキュメントと `NEXT_SESSION-41z.md` の commit
- 次セッション (execution、別ファイル `ori-41z-greenfield-2026-06-09.md` 予定)
  - `node .claude/skills/ori-flow/scripts/new-slice.js save-bookmark --type=command`
  - AI が `apm_modules/.../example-slice/task-management/slices/complete-task/` を
    on-demand 参照
  - `.ori/slices/save-bookmark/spec.md` 等の derive
  - `apps/<app>/src/bookmark-keeping/slices/save-bookmark/` の生成 (example-slice
    から *adapt*、physical copy NG)
  - architecture.md rules 遵守の eslint 確認

## ドメイン選定の意図

example-slice は `task-management` BC を提供しているため、同じ BC を採用すると
「AI が example-slice をそのままコピーした」のか「pattern として参照した」のかが
判別できない。本 acceptance では意図的に **異なる BC** (`bookmark-keeping`) を
選定し、AI が example-slice の構造 (`domain/`, `application/`, `infrastructure/`,
`presentation/`, `tests/`) を *adapt* した上で domain 固有の値 (Bookmark/URL/Title)
に置き換えていることを観測する。

## Test environment

- repo: `/tmp/ori-h4b-accept-1780991140` (新規 `bd init -p acc-h4b-` で git init + bd 初期化)
- branch (ori 本体): `task/ori-41z-greenfield-flow-new-slice`
- ori 本体 tip: `759873a` (PR #32 merge = H4 main 完了)
- toolchain: node 22.22.2 / pnpm 10.33.2 / apm 0.11.0
- session 形態: prep (本セッション) + execution (別セッション) の 2-session pattern

## Steps (本セッションで実施・完了)

| # | Step | Result |
|---|---|---|
| P-1 | greenfield `/tmp/ori-h4b-accept-$(date +%s)` 作成 + `git init` + `bd init -p acc-h4b-` | OK — `.beads/`, `.gitignore` 配置 |
| P-2 | `apm install dev-komenzar/ori` | OK — `.claude/{skills,rules,agents}/` に 32+8+1、`apm_modules/dev-komenzar/ori/` 展開、`example-slice/task-management/{shared,slices/complete-task}` も同梱 |
| P-3 | `bash .claude/skills/ori-init/scripts/create-skeleton.sh` | OK — `.ori/{config.yaml,domain/...,slices/.gitkeep,pages/,proposals/,state/}` 生成、app name = cwd basename `ori-h4b-accept-1780991140` |
| P-4 | `.ori/domain/{bounded-contexts,aggregates,glossary,domain-events,discovery}.md` に `bookmark-keeping` BC の最小内容を手書き | OK — Bookmark aggregate (BookmarkId/Url/Title/savedAt) + BookmarkSaved event を定義 |
| P-5 | `mkdir -p apps/ori-h4b-accept-1780991140 && cd apps/ori-h4b-accept-1780991140 && pnpm create vite@latest . --template vanilla-ts` | OK — `package.json`, `tsconfig.json`, `index.html`, `src/`, `public/` 生成 |
| P-6 | `node apm_modules/.../ori-arch/scripts/render-architecture.js --pattern ddd-vsa-hex --stack typescript --bc bookmark-keeping` | OK — `.ori/architecture.md` (5143B 相当) 出力、`slice_root: bookmark-keeping`、`slice_subdir: slices`、`public_entry: index.ts`、`adapter: eslint` |

## 次セッション準備物

| 項目 | パス |
|---|---|
| greenfield root | `/tmp/ori-h4b-accept-1780991140` |
| handoff doc | repo root の `NEXT_SESSION-41z.md` (untracked) |
| 検証本体の log 雛形 | 別ファイル `docs/acceptance/ori-41z-greenfield-2026-06-09.md` (次セッションで新規作成) |
| 検証対象 slice id | `save-bookmark` (command, in `bookmark-keeping` BC) |
| 参照すべき example-slice | `apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/patterns/ddd-vsa-hex/stacks/typescript/example-slice/task-management/slices/complete-task/` (Phase K2 移動後 path、prep 時点では `.apm/contexts/patterns/...`) |

## prep 段階で気づいた事項

### Pre-F-1: app name が長い (low, 既知)

- cwd basename `ori-h4b-accept-1780991140` がそのまま app name になる
- 既知の friction (ori-s44 acceptance F-1 と同根)。本セッションでは fix しない
- 別 issue `ori-gag` (P3 / feature) で carry-over 済

### Pre-F-2: prep セッションで `/ori-init` skill は使えない (構造的、既知)

- `apm install` 後の同セッション内で `/ori-init` を invoke しても skill registry に
  反映されないため、`bash .claude/skills/ori-init/scripts/create-skeleton.sh` を直接実行
- これは memory `skill-registry-load-timing-2026-06-03` の通り
- 本 acceptance では「prep は直接 script invoke」「execution は別セッションで skill
  invoke」の役割分担で対応 — 構造的制約のため 2-session pattern を採用

## 判定 (本セッション分)

prep 完了 — 次セッションで execution を実施する。

PR は execution セッション完了後にまとめて起こす方針 (本 pre log + 次 log + その他差分を 1 PR)。

## 参考

- `bd show ori-41z` — H4b タスク詳細 (parent: `ori-5er`、depends on: `ori-s44`)
- `docs/acceptance/ori-s44-greenfield-2026-06-07.md` — 前回 H4 main acceptance (雛形参照元、③ deferred を明記)
- memory `skill-registry-load-timing-2026-06-03` — 2-session pattern の根拠
- memory `feedback_acceptance_2session_pattern` — acceptance 分割の運用規約
