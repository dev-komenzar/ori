# Phase K greenfield acceptance — 2026-06-11 prep (ori-6kd.1)

`ori-6kd` (Phase K — runtime artifact を consuming skill bundle に co-locate)
の epic 完了条件: Phase K1 / K2 / K3 すべて main merge 後、greenfield に
`apm install` した skill bundle が **`--patterns-dir` / `--adapters-dir`
無し**で adapter / pattern / template を解決できること、および `.claude/contexts/`
が consumer 側に展開されないことを実機で実証する。

本ドキュメントは `feedback_acceptance_2session_pattern` memory に従う **prep
session** の log。execution は別 session で `/tmp/ori-acceptance-k` を cwd
にして fresh claude を起動して実施する (実行 log は本ファイルと別ファイル
`phase-k-greenfield-2026-06-11.md` に追記)。

## Scope

- 本セッション (prep)
  - greenfield directory 作成
  - `apm install dev-komenzar/ori --target claude`
  - integrated skills bundle の構造確認 (`.claude/skills/ori-arch/{adapters,patterns,
    architecture-md-schema.md,scripts,SKILL.md}` / `.claude/skills/ori-flow/{templates,
    scripts,SKILL.md}`)
  - `bash .claude/skills/ori-init/scripts/create-skeleton.sh` で `.ori/` skeleton
  - `.ori/domain/{bounded-contexts,aggregates,domain-events}.md` に `note-keeping`
    BC の最小ドメイン (`Note` aggregate + `NoteCreated` event)
  - `apps/ori-acceptance-k/` で `pnpm create vite@latest . --template vanilla-ts`
  - `NEW_SESSION_PROMPT.md` + `ACCEPTANCE_REPORT.md` skeleton 配置
  - 本 pre log の commit (branch: `task/ori-6kd1-phase-k-acceptance`)
- 次セッション (execution、別ファイル `phase-k-greenfield-2026-06-11.md` 予定)
  - `/ori-arch` で `.ori/architecture.md` を render
  - `/ori-arch` 内の export スクリプトで `eslint.config.ori.js` を生成
  - rust adapter export で `tests/arch.rs` を生成
  - `/ori-flow new-slice create-note --type=command` で slice manifest 生成
  - `.claude/contexts/` 非存在の確認

## ドメイン選定の意図

Phase K の検証対象は **skill bundle の self-contained 性** (adapters / patterns /
templates の co-location + `--patterns-dir` / `--adapters-dir` の不要化) なので、
ドメインの深さは無関係。意図的に最小 BC (`note-keeping` / `Note` aggregate のみ)
にしている。example-slice の `task-management` BC とは別名を選び「skill 内 path
解決の検証」と「example-slice on-demand 参照の検証 (ori-41z で別途実施済)」を
混同しないようにしてある。

## Test environment

| 項目 | 値 |
|---|---|
| greenfield root | `/tmp/ori-acceptance-k` |
| ori 本体 branch (prep) | `task/ori-6kd1-phase-k-acceptance` |
| ori 本体 tip (prep 開始時) | `8bbb997` (PR #43 = ori-6kd.3 merge / `.apm/contexts/` 廃止状態の main HEAD) |
| toolchain | node 24.x / pnpm 11.x / apm 0.11.0 |
| session 形態 | prep (本セッション) + execution (別セッション) の 2-session pattern |

## Steps (本セッションで実施・完了)

| # | Step | Result |
|---|---|---|
| P-1 | `rm -rf /tmp/ori-acceptance-k && mkdir -p /tmp/ori-acceptance-k` | OK |
| P-2 | `cd /tmp/ori-acceptance-k && git init --initial-branch=main` | OK |
| P-3 | `apm install dev-komenzar/ori --target claude` | OK — 32 skills / 8 rules / 1 agent integrated; `.claude/contexts/` は作られない |
| P-4 | bundle 構造確認 (`.claude/skills/ori-arch/{SKILL.md,adapters/,architecture-md-schema.md,patterns/,scripts/}` / `.claude/skills/ori-flow/{SKILL.md,scripts/,templates/}`) | OK — Phase K の最終形と一致 (ori repo main の `.apm/skills/...` と `diff` 0 で確認) |
| P-5 | `bash .claude/skills/ori-init/scripts/create-skeleton.sh` | OK — `.ori/{config.yaml,domain/...,slices/.gitkeep,pages/,proposals/,state/}` 生成、app name = `ori-acceptance-k`、bd init (prefix `ori-`) も同時実行 |
| P-6 | `.ori/domain/bounded-contexts.md` に `note-keeping` BC、`aggregates.md` に `Note` aggregate、`domain-events.md` に `NoteCreated` event を手書き | OK |
| P-7 | `cd apps/ori-acceptance-k && pnpm create vite@latest . --template vanilla-ts` | OK — `package.json`, `tsconfig.json`, `index.html`, `src/`, `public/` 生成 (`pnpm install` は execution session 側で実施) |
| P-8 | `NEW_SESSION_PROMPT.md` + `ACCEPTANCE_REPORT.md` skeleton 配置 (greenfield root 直下、untracked) | OK |
| P-9 | branch `task/ori-6kd1-phase-k-acceptance` で本 pre log を commit | OK (本 commit) |

## 次セッションへの引き継ぎ

| 項目 | パス |
|---|---|
| greenfield root | `/tmp/ori-acceptance-k` |
| 指示書 | greenfield root の `NEW_SESSION_PROMPT.md` |
| 結果記録先 | greenfield root の `ACCEPTANCE_REPORT.md` |
| 本体側の execution log 予定 | `docs/acceptance/phase-k-greenfield-2026-06-11.md` (実行後に作成) |
| 検証対象 BC | `note-keeping` (`apps/ori-acceptance-k` 内 `.ori/architecture.md` で slice_root) |
| 検証対象 slice id | `create-note` (command) |

## 既知の構造的制約 (再掲)

### Pre-Note-1: prep セッション内で skill invoke は不可

memory `skill-registry-load-timing-2026-06-03` の通り、`apm install` 直後の同
セッションでは新 skill bundle が registry に visible にならない。したがって
`/ori-arch` / `/ori-flow new-slice` は **本セッションでは実行できず**、別
セッション (test dir cwd / fresh claude) で実施する必要がある。これが
2-session pattern を採用する根拠。

### Pre-Note-2: test dir の bd workspace は main repo と分離

`bash create-skeleton.sh` 内部で `bd init -p ori- --non-interactive` が走るため、
`/tmp/ori-acceptance-k/.beads/` が main repo の `.beads/` と独立する。Execution
session 内で起票しても main repo には sync されないため、friction は
`ACCEPTANCE_REPORT.md` に列挙して元 session 側で main repo に bd 起票する。

## 判定 (本セッション分)

prep 完了 — 次セッションで execution を実施する。PR は execution セッション
完了後にまとめて起こす方針 (本 pre log + 次 log + ori-6kd.1 / ori-6kd close +
friction 起票を 1 PR)。

## 参考

- `bd show ori-6kd.1` — Phase K acceptance タスク詳細 (depends on ori-6kd.3)
- `bd show ori-6kd` — Phase K epic
- `docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md` — 前回 greenfield prep 雛形
- memory `feedback_acceptance_2session_pattern` — acceptance 分割の運用規約
- memory `skill-registry-load-timing-2026-06-03` — 2-session pattern の根拠
