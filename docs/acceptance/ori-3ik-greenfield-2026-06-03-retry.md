# ori-3ik greenfield acceptance — 2026-06-03 retry (post PR #13)

PR #13 (ori-9gy 等 6 件解消) merge 後の retry。前 session pre-retry log
(`docs/acceptance/ori-3ik-greenfield-2026-06-03-retry-pre.md`) で scaffold 動線は
完璧と確認済。本 retry は **`/ori-flow` 7-phase end-to-end の検証**が目的。

## Test environment

- repo: `/tmp/ori-acceptance-greenfield-3` (新規 git init、greenfield)
- branch: `task/ori-3ik-acceptance-retry` (ori 本体 repo 側)
- session: skill 開発 session の延長（**本 session の registry には `/ori-flow`
  が居ない**ため harness invocation 不可。後述）

## Prep steps (本 session で実施・完了)

| # | Step | Result |
|---|---|---|
| P-1 | `ori init` 経由 `.ori/` skeleton 作成 (skill `/ori-init` 内 `create-skeleton.sh` 直接実行) | ✅ `.ori/config.yaml` + domain scaffold 12 件 |
| P-2 | `apm install dev-komenzar/ori --target claude` | ✅ 32 skills → `.claude/skills/`、7 rules、1 agent 統合 |
| P-3 | template scaffold (`copy-template.sh --template ddd-vsa-hex-typescript`) | ✅ `apps/ori-acceptance-greenfield-3/src/{task-management,ui-page,ui-widget,__tests__}` 配置 |
| P-4 | `pnpm install` + `pnpm test` | ✅ 11/11 PASS (worked example: complete-task 8 + ui-flow 3) |
| P-5 | minimal DDD docs 投入 (BC / aggregates / workflows / glossary) | ✅ `archive-task` workflow + Task aggregate に `archived` status 追加で記述 |
| P-6 | `ori slice new archive-task` (pnpm dlx 経由) | ✅ `.ori/slices/archive-task/{manifest.yaml,spec.md,notes.md,status.yaml}` 作成 |
| P-7 | manifest.yaml + notes.md を context 付きで上書き | ✅ derives_from / generates / acceptance criteria 明示 |

## 残り step (新 claude session で実施が必要)

| # | Step | 期待結果 |
|---|---|---|
| R-1 | `cd /tmp/ori-acceptance-greenfield-3 && claude` で新 session を開く | skill registry が `.claude/skills/` を scan → `/ori-flow` 等が invokable に |
| R-2 | `/ori-flow archive-task` を invoke | 7-phase (derive → plan → test-red → impl-green → refactor → review → finalize) が順次実行 |
| R-3 | 検証 | `bd show ori-{derive,plan,test-red,impl-green,refactor,review,finalize}-archive-task` 全 closed、`apps/<app>/src/task-management/slices/archive-task/{domain,application,tests}/` に code 出る、`pnpm test` GREEN |

## Friction (本 session で検出)

### F-2: `pnpm dlx @ori-ori/cli slice new` が published 0.0.1 を取る（ori-8tx fix 未反映）

- `pnpm install` 出力: `+ @ori-ori/cli 0.0.1 (0.1.0 is available)` — テンプレ `package.json` が 0.0.1 を pin
- `ori slice new archive-task` 実行で `.ori/slices/archive-task/tests/` 空 dir が作られた
  - ori-8tx fix (`packages/cli/src/commands/slice.ts` から `mkdir tests/` 削除) は **0.1.0 で published 済だが**、template package.json が 0.0.1 pin のため反映されない
- 暫定対処：手動 `rm -rf .ori/slices/archive-task/tests`
- **抜本対処案**：`packages/templates/*/package.json` の `@ori-ori/cli` を `^0.1.0` に上げる
  → 別 issue 起票 (本 retry とは独立)

### F-3 (carry-over from pre-retry): /ori-arch interactive 部分の skill 不在検証ができていない

- 本 session では `/ori-arch` skill が registry に無いため、`copy-template.sh` を直接 bash したのみ
- 対話 (pattern / framework 選択 → template 名 derive) は skill SKILL.md instruction に依存し、その動作確認は新 session でのみ可能
- ただし decide → copy の copy 側 (script) は P-3 で動作確認済

### F-4: NEXT_SESSION.md に書かれた「新 session で /ori-arch 実行」の動線は本 retry の retry でないと完結しない

- 本 session は前 session (skill 開発 PR #13) の継続として開かれているため、registry は古い (skill 一覧に /ori-* 無し)
- 新 session の必要性は memory `skill-registry-load-timing-2026-06-03` に明文化されているとおり

## 結論（本 session 時点）

- **prep (P-1 〜 P-7) は全て完了**。/tmp/ori-acceptance-greenfield-3 は `/ori-flow archive-task` invoke 可能な状態
- **harness-level の `/ori-flow` 実行は新 claude session が必要** — 本 session の skill registry は ori repo の `.apm/skills/` を scan せず（ori repo は APM source であり target ではない）、test dir の `.claude/skills/` も session 開始後に install されたため反映されない
- `bd close ori-3ik` は新 session で R-2 / R-3 完走後に実施

## 新 session 起動手順（user 操作用）

```bash
cd /tmp/ori-acceptance-greenfield-3
claude
```

新 session 内で:

```
/ori-flow archive-task
```

7 phase の順次実行を確認し、各 phase の bd issue が closed になるのを観察する。
完走したら ori 本体 repo に戻り：

```bash
cd /home/takuya/ghq/github.com/dev-komenzar/ori
bd close ori-3ik --reason "greenfield acceptance passed on 2026-06-03; /ori-flow archive-task 完走; see docs/acceptance/ori-3ik-greenfield-2026-06-03-retry.md"
```

途中で blocker が出たら本 file の §Friction に追記し、phase 別に bd 起票する。
