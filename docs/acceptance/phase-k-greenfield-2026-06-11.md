# Phase K greenfield acceptance — 2026-06-11 execution (ori-6kd.1)

`ori-6kd` (Phase K epic) の完了条件を実機 (greenfield `/tmp/ori-acceptance-k`)
で実証する acceptance の **execution session log**。

prep session (commit `39b2777` on `task/ori-6kd1-phase-k-acceptance`) で構築した
greenfield に対し、本セッションでは fresh claude (test dir cwd) で以下を実施:

1. `apps/ori-acceptance-k/` の `pnpm install`
2. `render-architecture.js` で `.ori/architecture.md` 生成 (`--patterns-dir` 無し)
3. `export.js --adapter=eslint` で `apps/ori-acceptance-k/eslint.config.ori.js`
   生成 (`--adapters-dir` 無し)
4. rust adapter 検証 (stack=typescript-tauri に切替 → F-1 参照)
5. `new-slice.js create-note --type=command` で `.ori/slices/create-note/` を
   scaffold (templates は bundle 隣接 path から解決)
6. `.claude/contexts/` および `apm_modules/.../.apm/contexts/` の両方が存在
   しないことを確認

prep + execution の 2-session pattern (memory:
`feedback_acceptance_2session_pattern`) を採用した理由は
`skill-registry-load-timing-2026-06-03` memory の通り (`apm install` 後の同
セッションでは新 skill bundle が registry に visible にならない)。

## Test environment

| 項目 | 値 |
|---|---|
| greenfield root | `/tmp/ori-acceptance-k` |
| ori 本体 branch | `task/ori-6kd1-phase-k-acceptance` |
| ori 本体 HEAD (prep) | `39b2777` (PR #43 merge `8bbb997` + 本 acceptance branch prep commit) |
| toolchain | node 24.15.0 / pnpm 11.1.2 / apm 0.11.0 (dc0b53b) |
| target BC | `note-keeping` (`Note` aggregate + `NoteCreated` event) |
| target app | `apps/ori-acceptance-k` (vite vanilla-ts scaffold) |
| target slice | `create-note` (command) |

## Steps (本セッションで実施)

| # | Step | 実行コマンド | Result |
|---|---|---|---|
| E-1 | `pnpm install` (app) | `pnpm install` (cwd=`apps/ori-acceptance-k`) | OK — 16 packages added / 967ms (typescript 6.0.3 + vite 8.0.16) |
| E-2 | architecture.md render | `node .claude/skills/ori-arch/scripts/render-architecture.js --pattern ddd-vsa-hex --stack typescript --bc note-keeping --app ori-acceptance-k` | OK — `✔ Wrote .ori/architecture.md` / `pattern: ddd-vsa-hex`, `stack: typescript`, `slice_root: note-keeping`, `app: ori-acceptance-k`、**`--patterns-dir` 無しで pattern 解決成功** (K2 で skill bundle 隣接の patterns 解決を確認) |
| E-3 | eslint adapter export | `node .claude/skills/ori-arch/scripts/export.js --adapter=eslint` | OK — `✔ Wrote apps/ori-acceptance-k/eslint.config.ori.js`、header L2 = `// Regenerate via the /ori-arch skill (Claude Code) — see .apm/skills/ori-arch/SKILL.md`、**`--adapters-dir` 無しで adapter 解決成功** (K1 で skill bundle 隣接の adapters 解決を確認) |
| E-4 | rust adapter export (typescript stack) | `node .claude/skills/ori-arch/scripts/export.js --adapter=rust` | WARN — `Adapter "rust" produced no files. rust adapter skipped: root "default" is language=typescript, not rust.` → F-1 参照 |
| E-4' | rust adapter export (typescript-tauri stack 再 render 後) | `--stack typescript-tauri --force` で render → `node .claude/skills/ori-arch/scripts/export.js --adapter=rust --root=rs` | OK — `✔ Wrote apps/ori-acceptance-k/src-tauri/tests/arch.rs`、header L2 = `//! Regenerate via the /ori-arch skill (Claude Code) — see .apm/skills/ori-arch/SKILL.md`、**`--adapters-dir` 無しで rust adapter 解決成功** |
| E-5 | slice scaffold | `node .claude/skills/ori-flow/scripts/new-slice.js create-note --type=command` | OK — `.ori/slices/create-note/{manifest.yaml, spec.md, notes.md, status.yaml}` 4 files 生成、**templates は `.claude/skills/ori-flow/templates/slice-manifest.yaml.tpl` (bundle 隣接) から解決** (K3 で templates co-location を確認) |
| E-6 | contexts/ 非存在確認 | `ls .claude/contexts && ls apm_modules/dev-komenzar/ori/.apm/contexts` | OK — 両方とも `No such file or directory`。`apm_modules/dev-komenzar/ori/.apm/` 直下は `README.md, agents, instructions, skills` のみ |

## Acceptance criteria (bd issue ori-6kd.1)

| # | criterion | Result |
|---|---|---|
| 1 | apm install log で `.claude/skills/` 配下に adapters/patterns/templates が integrate された | ✓ (prep で確認、execution でも構造再確認) |
| 2 | `/ori-arch` 実行で `apps/<app>/eslint.config.ori.js` 生成、`--adapters-dir` 不要 | ✓ |
| 3 | eslint.config.ori.js header に `Regenerate via the /ori-arch skill` 含まれる | ✓ (`// Regenerate via the /ori-arch skill (Claude Code) — see .apm/skills/ori-arch/SKILL.md`) |
| 4 | rust adapter 実行で tests/arch.rs 生成、header 同様の skill-based invocation 案内 | ✓ (※stack=typescript-tauri 前提で。詳細は F-1) |
| 5 | `/ori-flow new-slice <id>` 実行で slice manifest 生成、templates 解決成功 | ✓ |
| 6 | consumer cwd に `.claude/contexts/` dir が存在しない | ✓ |
| 7 (optional) | rustfmt / prettier で format pass | 未実行 (optional のため deferred) |

## Phase K epic (ori-6kd) 完了条件

| # | criterion | Result |
|---|---|---|
| 1 | `.apm/contexts/` dir が repo から物理消滅 | ✓ (K3 merge 済、greenfield consumer 側でも非展開を確認) |
| 2 | `/ori-arch` (export + render) が consumer で `--adapters-dir` / `--patterns-dir` flag 無しに動作 | ✓ (E-2 + E-3 + E-4') |
| 3 | adapter / patterns / templates の SSoT が source workspace (packages/) または skill bundle (.apm/skills/) に存在、source test が `.apm/` を覗き込まない | ✓ (K1/K2/K3 merge 済) |
| 4 | docs/design.md に Phase K の learning が明文化 | ✓ (`docs/design.md` L1026 〜 "Phase K co-location map" 節 + L928〜L976 のツリー / build 記述) |

⇒ Phase K epic 完了。`ori-6kd.1` と `ori-6kd` を本 PR merge で close する。

## Friction

### F-1: typescript-only stack に rust adapter を回すと no-op (acceptance plan の自己矛盾)

**現象**：NEW_SESSION_PROMPT.md は Step 2 で `stack: typescript` を指定するが、
Step 4 ではそのまま `node .claude/skills/ori-arch/scripts/export.js --adapter=rust`
を指示している。`typescript` stack の architecture.md は単一 root
(`language: typescript`) のみなので rust adapter は no-op (`WARN Adapter "rust"
produced no files. rust adapter skipped: root "default" is language=typescript,
not rust.`) で抜け、`tests/arch.rs` は生成されない。

**原因**：rust root を含むのは `typescript-tauri` stack のみ。acceptance plan
作成時に stack ↔ adapter matrix を考慮し損ねた (NEW_SESSION_PROMPT.md prep 側の
記述ミス)。

**impact**：skill / script の挙動は設計通り (silent overwrite を避ける safe
default)。ただし acceptance plan 通りに進めると Step 4 が成立せず、executor が
自ら救済 step (`--stack typescript-tauri --force` で再 render → `--root=rs`
明示) を回す必要があった。

**推奨 fix** (carry-over bd issue として起票)：
- 案 A (推奨): 次回 acceptance plan の Step 2 を `stack=typescript-tauri` 既定
  に変更し、Step 4 を `--adapter=rust --root=rs` 明示にする。これで Step 4 が
  自然に成立する
- 案 B: 別 sub-step に分け「Step 4a (typescript stack): rust adapter は skip
  警告を出すこと」「Step 4b (typescript-tauri stack で確認): tests/arch.rs を
  生成し header を含む」と two-phase 化
- 案 C: rust adapter を typescript-only stack で叩いた時の messaging を「skip
  ではなく hard error + 解決導線提示」に強化 (skill 側修正)

skill / export.js 側の skip 挙動 (今の messaging) はむしろ正しい (silent overwrite を
避ける safe default) ため、**案 A** を推奨。

→ bd 起票済: `ori-t48` (P3 / task / docs) — "Phase K acceptance plan: rust adapter step を typescript-tauri stack 前提に直す"。

## Overall verdict

**Pass-with-friction**

- Phase K の本丸 (skill bundle 隣接化により `--patterns-dir` / `--adapters-dir`
  指定が不要になったこと、`.apm/contexts/` および `.claude/contexts/` が consumer
  側に残らないこと) は全 step で確認できた
- friction F-1 は acceptance plan (NEW_SESSION_PROMPT.md) と adapter matrix の
  不整合であり、skill / script の挙動そのものは設計通り
- Phase K epic (ori-6kd) の 4 完了条件すべて充足 → 本 PR merge で `ori-6kd.1`
  / `ori-6kd` 両方 close する

## 参考

- `docs/acceptance/phase-k-greenfield-2026-06-11-pre.md` — prep session log
- `bd show ori-6kd` / `bd show ori-6kd.1` — タスク詳細
- memory `feedback_acceptance_2session_pattern` — acceptance 分割の運用規約
- memory `skill-registry-load-timing-2026-06-03` — 2-session pattern の根拠
- `docs/design.md` §17 / Phase K co-location map — Phase K 学習の明文化先
