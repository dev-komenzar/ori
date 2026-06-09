# NEXT_SESSION — ori-41z (Phase H4b: greenfield で /ori-flow new-slice → example-slice 参照を end-to-end 検証)

このファイルは別 session で `ori-41z` の **execution セッション** を回すための引継ぎ書。
Claude Code を起動したら、まず本ファイル全体を読み込み、続けて以下を実行する。

```bash
bd prime              # beads workflow recovery
bd show ori-41z       # 当該 issue の最新版を取得
```

prep セッションの実施内容は `docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md` に記録済。

---

## 前提

### 2-session pattern を採用している理由

`skill-registry-load-timing-2026-06-03` memory:
Claude Code の skill registry は session 開始時に 1 回 scan され、`apm install` 後の
同一 session 内では新しい skill が認識されない。`/ori-flow` を skill invoke として
回したいため、prep (apm install 等) と execution (`/ori-flow new-slice` invoke) は
別 session に分ける必要がある。

### greenfield の状態 (prep セッション終了時点 — 2026-06-09)

- path: `/tmp/ori-h4b-accept-1780991140`
- 既に完了している事項:
  - `git init` + `bd init -p acc-h4b-`
  - `apm install dev-komenzar/ori`
  - `bash .claude/skills/ori-init/scripts/create-skeleton.sh` → `.ori/` 雛形
  - `.ori/domain/{bounded-contexts,aggregates,glossary,domain-events,discovery}.md` に
    `bookmark-keeping` BC の最小ドメインを書き込み
  - `pnpm create vite@latest apps/ori-h4b-accept-1780991140 --template vanilla-ts`
  - `node apm_modules/.../ori-arch/scripts/render-architecture.js --pattern ddd-vsa-hex --stack typescript --bc bookmark-keeping`
    → `.ori/architecture.md` 配置済

### greenfield が消えていた場合 (再構築 recipe)

`/tmp/` は OS reboot で消えうる。`ls /tmp/ori-h4b-accept-1780991140` で確認し、
無ければ prep セッションの手順を再実行する:

```bash
# 注意: タイムスタンプを含む新ディレクトリを掘ると app name も変わる。
# 同一名で再構築するなら以下:
mkdir -p /tmp/ori-h4b-accept-1780991140
cd /tmp/ori-h4b-accept-1780991140
git init -q
bd init -p acc-h4b-
apm install dev-komenzar/ori
bash .claude/skills/ori-init/scripts/create-skeleton.sh
# ※ create-skeleton.sh は cwd basename を app name として書く
# .ori/domain/*.md は ori repo の prep セッション履歴から復元 (本ファイル参照先)
mkdir -p apps/ori-h4b-accept-1780991140
cd apps/ori-h4b-accept-1780991140
pnpm create vite@latest . --template vanilla-ts
cd ..
node apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/render-architecture.js \
  --pattern ddd-vsa-hex --stack typescript --bc bookmark-keeping
```

ドメイン最小内容は `/home/takuya/ghq/github.com/dev-komenzar/ori/docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md`
のテーブル + bd issue `ori-41z` description から復元できる。再構築が困難な場合は ori 本体
リポジトリで `git show <pre-commit>:docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md` 参照。

### ori 本体リポジトリ状態 (prep セッション終了時点)

- branch: `task/ori-41z-greenfield-flow-new-slice`
- HEAD: prep セッションの commit (`docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md`
  + 本ファイル `NEXT_SESSION-41z.md` の 2 ファイル追加)
- 本セッションでも同じ branch を使う

---

## 実行タスク

### Step 0: 状態確認

```bash
# greenfield 存在確認
ls /tmp/ori-h4b-accept-1780991140/.ori/architecture.md  # 存在すること
ls /tmp/ori-h4b-accept-1780991140/.ori/slices/          # .gitkeep のみ

# ori 本体 branch
cd /home/takuya/ghq/github.com/dev-komenzar/ori
git status   # task/ori-41z-greenfield-flow-new-slice
git log --oneline -3
```

### Step 1: `/ori-flow new-slice` 起動 → example-slice 参照 → slice 生成

cwd を greenfield に切り替えて、`new-slice.js` で scaffold:

```bash
cd /tmp/ori-h4b-accept-1780991140
node .claude/skills/ori-flow/scripts/new-slice.js save-bookmark --type=command
ls .ori/slices/save-bookmark/   # manifest.yaml / spec.md / notes.md / status.yaml
```

ここからは **AI 自身** が以下を順に実行:

1. **example-slice 構造を読む** (on-demand 参照、acceptance の核):

   ```bash
   ls apm_modules/dev-komenzar/ori/.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/task-management/slices/complete-task/
   # → domain/, application/, infrastructure/, presentation/, tests/
   ```

   - 各層の代表ファイル (`domain/task.ts`, `application/complete-task.ts`,
     `presentation/task-card.ts`, `tests/task.test.ts` 等) を Read で取得
   - **読んだファイルとそのタイミングを log に明示** (acceptance の根拠)

2. **.ori/slices/save-bookmark/spec.md を埋める** — `.ori/domain/aggregates.md` の
   Bookmark 定義 (URL/Title/savedAt) + `domain-events.md` の BookmarkSaved に基づき:
   - 概要: 「URL とタイトルから Bookmark を新規保存する command slice」
   - 入出力: input = `{url: string, title: string}` / output = `BookmarkId`
   - 不変条件: URL は http(s) スキーム必須、Title は 1〜200 文字
   - テスト観点: valid URL / invalid URL / Title 境界
   - 実装ノート: example-slice/complete-task を参照したことを記載

3. **コード生成** — `apps/ori-h4b-accept-1780991140/src/bookmark-keeping/slices/save-bookmark/`
   配下に、example-slice/complete-task の構造を *adapt* して作る:

   ```
   apps/ori-h4b-accept-1780991140/src/bookmark-keeping/
   ├── shared/
   │   └── ... (example-slice/shared/ を参考に最小限)
   └── slices/
       └── save-bookmark/
           ├── index.ts                                # public_entry (architecture.md より)
           ├── domain/
           │   ├── bookmark.ts                        # Bookmark aggregate
           │   ├── bookmark-id.ts                     # BookmarkId VO
           │   ├── bookmark-url.ts                    # BookmarkUrl VO (http(s) のみ)
           │   ├── bookmark-title.ts                  # BookmarkTitle VO (1..=200)
           │   └── events.ts                          # BookmarkSaved
           ├── application/
           │   └── save-bookmark.ts                   # use case
           ├── infrastructure/
           │   └── .gitkeep                           # (example-slice と同様 placeholder)
           ├── presentation/
           │   └── bookmark-form.ts                   # 簡易 UI
           └── tests/
               └── bookmark.test.ts                   # vitest
   ```

   - **physical copy せず、`task` → `bookmark`, `complete` → `save` の対応で adapt**
   - 関連名: `Task` → `Bookmark`, `TaskId` → `BookmarkId`, `TaskTitle` → `BookmarkTitle`,
     `TaskCompleted` → `BookmarkSaved`, etc.
   - 新規必要な VO: `BookmarkUrl` (URL のスキーム検証)

4. **example-slice 物理 copy 検査** (必須):

   ```bash
   # apps/ 配下に "task" や "complete-task" の単語が残っていないこと
   grep -ri 'task-management\|complete-task\|TaskId\|TaskTitle\|TaskCompleted' apps/ \
     && echo "VIOLATION: example-slice physical copy detected" || echo "OK"
   ```

5. **architecture.md rule 違反検査** (eslint via `/ori-arch` export):

   ```bash
   # eslint.config.ori.js 生成
   cd apps/ori-h4b-accept-1780991140
   pnpm add -D @ori-ori/arch-adapter-eslint
   node ../../apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/export.js \
     --adapter=eslint --spec=../../.ori/architecture.md
   # eslint 実行
   pnpm add -D eslint typescript-eslint
   pnpm exec eslint src/
   ```

   - `cross_layer` rules (presentation → application → domain → shared) と
     `same_layer: prohibited`、`public_entry_required` が違反していないこと

   注意: `ori-apv` (PR #34, OPEN) が merge されると adapter 解決方式が変わるため、
   本セッション時点では旧 `@ori-ori/arch-adapter-eslint` npm package + `export.js` の
   組合せで動くはず (ori-s44 acceptance S-7 で動作確認済)。

### Step 2: acceptance log を書く

`docs/acceptance/ori-41z-greenfield-2026-06-09.md` を新規作成。雛形は
`docs/acceptance/ori-s44-greenfield-2026-06-07.md` を参照 (s44 と同じ形式)。

含めるべき内容:
- AI が読んだ example-slice ファイル一覧 (on-demand 参照の根拠)
- 生成した slice のファイル tree
- physical copy 検査の結果 (`grep` 出力)
- eslint 結果 (PASS / 違反内訳)
- 完了条件 ①〜⑥ の判定 (issue description より)
- 検出された friction (F-x) があれば carry-over を明記

### Step 3: 完了条件の判定

`bd show ori-41z` の完了条件:

- [ ] 上記 6 ステップで NO_ERROR
- [ ] example-slice/ への on-demand 参照が AI の判断ログ (acceptance log) に残る
- [ ] 生成 slice が architecture.md のルール違反しない (eslint で確認)

全 PASS なら `bd close ori-41z`、PASS しない場合は close せずに friction を log + bd 起票。

### Step 4: commit + PR

ori repo (`/home/takuya/ghq/github.com/dev-komenzar/ori`) で:

```bash
git add docs/acceptance/ori-41z-greenfield-2026-06-09.md
# (必要なら friction fix も)
git rm NEXT_SESSION-41z.md  # execution 完了で役目を終える
git commit -m "..."
git push -u origin task/ori-41z-greenfield-flow-new-slice
gh pr create --title "feat(v0.3-H4b): greenfield で /ori-flow new-slice → example-slice 参照を end-to-end 検証 (ori-41z)" \
  --body "..."
```

PR 本文には pre + main の log の linkage を明示。

### Step 5: session close

CLAUDE.md の Session Completion sequence 厳守:

```bash
cd /home/takuya/ghq/github.com/dev-komenzar/ori
git pull --rebase
bd dolt push
git push
git status   # "up to date with origin" を確認
```

---

## これまでの制約 (新 session が踏みやすい罠)

### 言語ポリシー (CLAUDE.md)

- 思考は英語 OK、**応答 / PR title / description は日本語**
- コード内の英語専門用語 (slice, aggregate, etc.) はそのまま OK

### beads workflow

- task tracking は `bd` 一本、TodoWrite / TaskCreate / markdown TODO は使用禁止
- 永続知識は `bd remember "..."`、MEMORY.md は禁止
- session 終了の必須シーケンスは Step 5 参照

### skill-only モデル

- `/ori-flow new-slice` は **skill 経由 invoke** (`/ori-flow` を起動 → 内部で
  `new-slice.js` を spawn) ではなく、本 acceptance では **scripts/new-slice.js を
  直接 invoke** する形を採用 (前回 prep セッションの選定、Q2 = Option B)
- これは scaffold だけ叩いて、AI が example-slice 参照 → 中身を埋める設計
- 「`/ori-flow <id>` で 7-phase chain を回す」のは別の機能 (本 acceptance の対象外)

### example-slice 参照の record 方法

- AI が読んだファイルパスとタイミングを acceptance log に明示すること
- Read tool の呼び出し回数で「on-demand 参照」を裏付ける
- 物理 copy しない (apps/ 配下に `task`, `complete-task` 等が残らない)

### emoji 禁則

ユーザ明示要求が無い限り emoji 不使用

### 並行作業

- PR #33 (ori-1gs) / PR #34 (ori-apv) が OPEN。本 PR とは独立だが、merge 順は
  ori-apv → ori-41z だと dirty になる可能性 (adapter 解決方式変更による)
- 本 PR は ori-apv より先に出して merge する想定。執筆時点で確認:

  ```bash
  gh pr view 34
  ```

### git hygiene

- 新 commit 推奨、`--amend` は origin push 後は禁則
- `git add -A` / `.` 不使用、明示パス指定

---

## 引継ぎチェックリスト

新 session が着手前に以下を埋めてから Step 1 へ:

- [ ] `bd prime` 実行済
- [ ] `bd show ori-41z` で issue 最新版確認
- [ ] greenfield `/tmp/ori-h4b-accept-1780991140` 存在確認 (無ければ再構築 recipe 参照)
- [ ] `.ori/architecture.md` 存在確認
- [ ] PR #34 (ori-apv) merge 状態を `gh pr view 34` で確認
- [ ] memory `skill-registry-load-timing-2026-06-03` を一読
- [ ] memory `feedback_acceptance_2session_pattern` を一読

埋めたら Step 1 (`/ori-flow new-slice` 起動) へ。
