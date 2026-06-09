# NEXT_SESSION — ori-41z execution (Phase H4b)

## 使い方

1. **新規 Claude Code session を greenfield で開く**:
   ```bash
   cd /tmp/ori-h4b-accept-1780991140
   claude
   ```
   (session の cwd が greenfield になることで、AI は fresh-context で example-slice を on-demand 参照することになる — これが acceptance の核心)

2. 下の ``` ブロックの中身を **そのままコピペして最初のメッセージとして送信**。
   greenfield からは ori repo の本ファイルを Read しにくいので、自己完結プロンプト形式にしてある。

3. プロンプトが終わると、別のセッション (本セッション or ori repo で開いた新 session) で `git add docs/acceptance/...md` → commit → PR の流れに戻る (プロンプト末尾の Step 4/5 で指示)。

---

## コピペ用プロンプト

```
あなたは ori-41z (v0.3-H4b greenfield acceptance) の execution セッションを担当します。
本セッションの cwd は /tmp/ori-h4b-accept-1780991140 (greenfield) になっているはず。
prep セッションでこの greenfield は apm install / ori-init / vite init / render-architecture.js まで配置済。
言語ポリシー: 思考は英語可、応答は日本語、PR title/description も日本語。

## ゴール

bd issue ori-41z の完了条件:
- AI が `/ori-flow new-slice` で example-slice/ を on-demand 参照して slice を生成できる
- example-slice/ への on-demand 参照が AI の判断ログ (acceptance log) に残る
- 生成 slice が architecture.md のルール (cross-slice 禁止 / public_entry / layer 順序) に違反しない

採用方針 (prep セッションで確定):
- Option B = `scripts/new-slice.js` で scaffold だけ叩き、AI が example-slice を参照して中身を埋める
- 7-phase chain (/ori-flow) の起動は対象外
- BC は `bookmark-keeping` を採用 (example-slice の `task-management` と意図的に別)
- 生成 slice は `save-bookmark` (--type=command)

## 前提状態 (prep セッション完了時点)

cwd = `/tmp/ori-h4b-accept-1780991140`、以下が配置済:
- `.beads/` (bd init -p acc-h4b- 済)
- `apm.yml` / `apm.lock.yaml` (apm install dev-komenzar/ori 済)
- `.claude/skills/`, `.claude/rules/`, `.claude/agents/` (32+8+1 統合済)
- `apm_modules/dev-komenzar/ori/.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/task-management/` (参照対象)
- `.ori/config.yaml` (app=`ori-h4b-accept-1780991140`)
- `.ori/domain/{bounded-contexts,aggregates,glossary,domain-events,discovery}.md` (bookmark-keeping BC の最小内容)
- `.ori/architecture.md` (pattern=ddd-vsa-hex / stack=typescript / bc=bookmark-keeping)
- `apps/ori-h4b-accept-1780991140/` (vite vanilla-ts init 済)

ori 本体 repo は `/home/takuya/ghq/github.com/dev-komenzar/ori/` (branch `task/ori-41z-greenfield-flow-new-slice`)。
Step 4 で acceptance log を書き、commit + PR を行う。

## Step 0: 状態確認

~~~bash
pwd  # /tmp/ori-h4b-accept-1780991140
ls .ori/architecture.md  # 存在
ls .ori/slices/          # .gitkeep のみ
head -40 .ori/architecture.md  # slice_root=bookmark-keeping を確認
cat .ori/domain/aggregates.md  # Bookmark aggregate 定義を頭に入れる
~~~

万一 greenfield が消えていた場合 (OS reboot 等):

~~~bash
# 注意: 同じパス名で再構築するなら以下。app name は cwd basename になる
mkdir -p /tmp/ori-h4b-accept-1780991140
cd /tmp/ori-h4b-accept-1780991140
git init -q
bd init -p acc-h4b-
apm install dev-komenzar/ori
bash .claude/skills/ori-init/scripts/create-skeleton.sh
# .ori/domain/*.md の内容は ori repo の docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md 参照
mkdir -p apps/ori-h4b-accept-1780991140
cd apps/ori-h4b-accept-1780991140
pnpm create vite@latest . --template vanilla-ts
cd ..
node apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/render-architecture.js \
  --pattern ddd-vsa-hex --stack typescript --bc bookmark-keeping
~~~

## Step 1: new-slice.js で scaffold

~~~bash
node .claude/skills/ori-flow/scripts/new-slice.js save-bookmark --type=command
ls .ori/slices/save-bookmark/   # manifest.yaml / spec.md / notes.md / status.yaml
~~~

## Step 2: example-slice を on-demand 参照 → adapt して実装

ここが acceptance の本体。以下を順に行うこと:

### 2-A: example-slice を読む (Read tool を使う — その call 自体が「on-demand 参照」の根拠)

~~~bash
ls apm_modules/dev-komenzar/ori/.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/task-management/slices/complete-task/
~~~

その上で Read tool で以下を読む (acceptance log に「読んだファイル一覧」として記録):
- `apm_modules/dev-komenzar/ori/.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/task-management/slices/complete-task/index.ts`
- `apm_modules/.../complete-task/domain/{task.ts,task-id.ts,task-title.ts,events.ts}`
- `apm_modules/.../complete-task/application/complete-task.ts`
- `apm_modules/.../complete-task/presentation/task-card.ts`
- `apm_modules/.../complete-task/tests/task.test.ts`
- `apm_modules/.../task-management/shared/{index.ts,contracts/index.ts,events/event.ts,types/result.ts,types/index.ts}` (shared kernel の参照)

### 2-B: spec を埋める

`.ori/slices/save-bookmark/spec.md` を `.ori/domain/aggregates.md` + `domain-events.md` を根拠に編集:
- 概要: URL とタイトルから Bookmark を新規保存する command slice
- 入出力: input `{url: string, title: string}` → output `BookmarkId`
- 不変条件: URL は http(s) スキーム必須、Title は 1〜200 文字
- テスト観点: valid URL / invalid URL / Title 境界 (0, 1, 200, 201)
- 実装ノート: example-slice/complete-task の構造 (`domain/application/infrastructure/presentation/tests` 5 層) を adapt したことを記載

### 2-C: コード生成 — apps/<app>/src/bookmark-keeping/slices/save-bookmark/

example-slice の構造を `task` → `bookmark`, `complete` → `save` で adapt:

~~~
apps/ori-h4b-accept-1780991140/src/bookmark-keeping/
├── shared/
│   └── ... (example-slice/shared/ を参考に最小限。本 acceptance では 1 slice なので contracts は省略可)
└── slices/
    └── save-bookmark/
        ├── index.ts                                # public_entry (architecture.md 参照)
        ├── domain/
        │   ├── bookmark.ts                        # Bookmark aggregate (Task の adapt)
        │   ├── bookmark-id.ts                     # BookmarkId VO
        │   ├── bookmark-url.ts                    # BookmarkUrl VO (http(s) のみ受理) — 新規必要
        │   ├── bookmark-title.ts                  # BookmarkTitle VO (1..=200)
        │   └── events.ts                          # BookmarkSaved event
        ├── application/
        │   └── save-bookmark.ts                   # use case (complete-task の adapt)
        ├── infrastructure/
        │   └── .gitkeep                           # example-slice 同様 placeholder
        ├── presentation/
        │   └── bookmark-form.ts                   # 簡易 UI (task-card.ts の adapt)
        └── tests/
            └── bookmark.test.ts                   # vitest (task.test.ts の adapt)
~~~

**物理 copy 厳禁** — example-slice の文字列をそのままコピペせず、ドメイン語彙 (Bookmark/Url/Title/Saved) で書き直すこと。

## Step 3: 検証

### 3-A: 物理 copy していないことを確認

~~~bash
grep -ri 'task-management\|complete-task\|TaskId\|TaskTitle\|TaskCompleted\|class Task\b' apps/ \
  && echo "VIOLATION: example-slice physical copy detected" || echo "OK: no task-management residue"
~~~

### 3-B: architecture.md の rule を eslint で検査

~~~bash
cd apps/ori-h4b-accept-1780991140
pnpm install
pnpm add -D @ori-ori/arch-adapter-eslint eslint typescript-eslint
node ../../apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/export.js \
  --adapter=eslint --spec=../../.ori/architecture.md
ls eslint.config.ori.js   # 出力確認
pnpm exec eslint src/     # cross_layer / public_entry / same_layer violation 検出
cd ../..
~~~

注意: PR #34 (ori-apv) が merge 後の場合、adapter 解決方式が template + injection に変わる。
そのときは export.js の invocation や devDeps が変更されている可能性がある。
本セッションが ori-apv merge 後なら export.js の最新動作を確認すること。

### 3-C: vite build (smoke)

~~~bash
cd apps/ori-h4b-accept-1780991140
pnpm exec vitest run    # tests が通ること (Bookmark VO の境界値)
pnpm build              # tsc transform + vite bundle が通ること
cd ../..
~~~

## Step 4: acceptance log を ori repo に書く

ここからは ori repo に切り替え:

~~~bash
cd /home/takuya/ghq/github.com/dev-komenzar/ori
git status   # branch task/ori-41z-greenfield-flow-new-slice
~~~

`docs/acceptance/ori-41z-greenfield-2026-06-09.md` を新規作成。雛形は `docs/acceptance/ori-s44-greenfield-2026-06-07.md` と prep 版 `docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md` を参考にする。

含めるべき内容:
- 環境情報 (greenfield path / ori HEAD / toolchain)
- Step 1 〜 3 の結果テーブル
- AI が読んだ example-slice ファイル一覧 (on-demand 参照の根拠 — Step 2-A の Read tool call 履歴)
- 生成した slice のファイル tree (apps/<app>/src/bookmark-keeping/slices/save-bookmark/ の構造)
- 物理 copy 検査の grep 出力
- eslint 結果 (PASS or 違反内訳)
- vitest / build の結果
- 完了条件 3 点の判定
- 検出された friction (F-x) があれば bd 起票 + carry-over 明記
- 「prep + main の 2-session pattern を採用した結果、AI は example-slice を on-demand で参照した」結論を明記

## Step 5: 完了条件の判定

~~~bash
bd show ori-41z   # 完了条件を確認
~~~

3 条件すべて PASS なら次の Step 6 へ。PASS しない場合は close せず friction を log + bd 起票 (本 prompt の Step 4 末尾を参照)。

## Step 6: commit + PR

~~~bash
cd /home/takuya/ghq/github.com/dev-komenzar/ori
git add docs/acceptance/ori-41z-greenfield-2026-06-09.md
# friction fix を本 PR 同梱する場合のみ:
# git add <fix 対象パス>
git rm NEXT_SESSION-41z.md   # execution 完了で本ファイルは役目終了
git commit -m "feat(v0.3-H4b): greenfield で /ori-flow new-slice → example-slice 参照を end-to-end 検証 (ori-41z)"
git push
gh pr create --title "feat(v0.3-H4b): greenfield で /ori-flow new-slice → example-slice 参照を end-to-end 検証 (ori-41z)" --body "..."
~~~

PR body には:
- prep + execution の 2-session pattern を採用した経緯
- example-slice on-demand 参照の根拠 (Read tool call 数 / 読んだファイル一覧)
- 物理 copy していない grep 出力
- eslint PASS の出力
- pre / main acceptance log への link

## Step 7: bd close + session close

~~~bash
bd close ori-41z
bd dolt push
git pull --rebase
git push
git status   # "up to date with origin" を確認
~~~

## 制約 (新 session が踏みやすい罠)

- 言語ポリシー: 応答 / PR は日本語
- task tracking は bd 一本 (TodoWrite / TaskCreate / MEMORY.md 禁止)
- emoji は明示要求が無い限り使用しない
- destructive 操作 (`git reset --hard`, `force push`, `branch -D`) はユーザ確認必須
- `git add -A` / `git add .` 不使用、明示パス指定
- example-slice は **読む** だけで、文字列を copy しない (LLM に「task → bookmark で adapt」と明示)
- PR #34 (ori-apv) が OPEN なら merge 順を意識 (本 PR は ori-apv より先に merge する想定)

## 引継ぎチェックリスト (Step 0 と並行で埋める)

- [ ] cwd = `/tmp/ori-h4b-accept-1780991140`
- [ ] `.ori/architecture.md` 存在
- [ ] bd show ori-41z で in_progress 確認
- [ ] PR #34 (ori-apv) の merge 状態を `cd /home/takuya/ghq/github.com/dev-komenzar/ori && gh pr view 34` で確認
- [ ] `apm_modules/dev-komenzar/ori/.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/task-management/slices/complete-task/` 配置確認

埋めたら Step 1 (new-slice.js scaffold) へ。
```

---

## 参考

- prep log: [docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md](docs/acceptance/ori-41z-greenfield-2026-06-09-pre.md)
- 前回 acceptance: [docs/acceptance/ori-s44-greenfield-2026-06-07.md](docs/acceptance/ori-s44-greenfield-2026-06-07.md)
- bd issue: `bd show ori-41z`
