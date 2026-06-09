# ori-s44 greenfield acceptance — 2026-06-07 (v0.3 Phase H4)

v0.3 Phase H3 (`packages/templates/` 物理撤去 / PR #31) merge 後の retry。
Phase H4 main (`ori-s44`) として「APM 配布された ori v0.3 が三段構え動線
(`/ori-init` → upstream framework init → `/ori-arch`) を end-to-end 完走するか」
を greenfield で検証する。

## Scope

本 acceptance で扱う **完了条件は ① + ② のみ** (2026-06-07 確定、`bd comments` 記録済):

- ① greenfield で `apm install` → `/ori-arch` がエラーなく完走
- ② target に `.ori/architecture.md` が書かれ、bootstrap は upstream init 由来
- ③ AI が `/ori-flow new-slice` で example-slice/ を on-demand 参照して slice 生成
  → **本 acceptance では扱わない。`ori-41z` (H4b) に deferred**

`ori-s44` 完了条件の文末「(別 issue で詳細検証でも可)」を採用。`/ori-flow` は
`skill-registry-load-timing-2026-06-03` memory の制約で 2-session pattern が
必要なため本 PR スコープから切り離す。

## Test environment

- repo: `/tmp/ori-acceptance-h4-greenfield` (新規 `bd init -p acc-h4-` で git init + bd 初期化)
- branch (ori 本体): `task/ori-s44-greenfield-acceptance-h4`
- ori 本体 tip: `1908bc5` (PR #31 merge = H3 完了)
- toolchain: node 22.22.2 / pnpm 10.33.4 / npm 10.9.7 / apm 0.11.0
- session 形態: 本 ori repo 上の session から greenfield dir を bash で操作 (greenfield 内で
  別 claude session は開かない — `/ori-init` / `/ori-arch` の対話部分は本 session の AI が
  SKILL.md instruction に従って手で代行)

## Steps (本 session で実施・完了)

| # | Step | Result |
|---|---|---|
| S-1 | `apm install dev-komenzar/ori` | ✅ `.claude/{skills,rules,agents}/` に 32+8+1 統合、`apm_modules/dev-komenzar/ori/` 展開 |
| S-2 | `/ori-init` 相当: `bash .claude/skills/ori-init/scripts/create-skeleton.sh` | ✅ `.ori/{config.yaml,domain,pages,proposals,slices,state}/` 作成、ルート余計ファイル無し (silent ✓)、既存 `.beads/` は idempotent に skip |
| S-3 | `/ori-arch` 相当 step 2: `mkdir -p apps/<app> && pnpm create vite@latest . --template vanilla-ts` | ✅ `apps/ori-acceptance-h4-greenfield/{package.json,tsconfig.json,index.html,src/,public/,.gitignore}` 生成 |
| S-4 | `/ori-arch` 相当 step 3: `node apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/render-architecture.js --pattern ddd-vsa-hex --stack typescript --bc task-management` | ✅ `.ori/architecture.md` (5143B) 出力、`{{APP_NAME}}` = `ori-acceptance-h4-greenfield`、`{{BC_NAME}}` = `task-management` 解決、`slice_root` 等 frontmatter valid |
| S-5 | 動作確認: `cd apps/<app> && pnpm install` | ✅ vite 8.0.16 + typescript 6.0.3 install |
| S-6 | 動作確認: `pnpm build` (vite vanilla-ts には `test` script なく `build` で代用) | ✅ 50ms / 9 modules transformed / dist 生成 |
| S-7 | 動作確認: `pnpm add -D @ori-ori/arch-adapter-eslint` + `node ../../apm_modules/.../export.js --adapter=eslint --spec=../../.ori/architecture.md` | ✅ `eslint.config.ori.js` (2163B) 生成、`boundaries/elements` + `boundaries/element-types` rules 含む |

## 完了条件チェック

| 条件 | 結果 | 根拠 |
|---|---|---|
| ① apm install → /ori-arch 完走 | ✅ PASS | S-1 〜 S-4 でエラーなし、`render-architecture.js` exit 0 |
| ② `.ori/architecture.md` が target に、bootstrap は upstream init 由来 | ✅ PASS | `.ori/architecture.md` 1 ファイルのみが ori 由来、`apps/<app>/{package.json,tsconfig.json,index.html,src/,...}` は vite 由来 (`/ori-arch` skill 自身は apps/ 配下にファイル書かない) |
| ③ /ori-flow new-slice + example-slice 参照 | ⏸ deferred | `ori-41z` (H4b) で別 PR |

## Friction (本 retry 検出分)

### F-1: cwd basename がそのまま app name になり、ファイル名が長くなる (low)

- `create-skeleton.sh` は cwd basename (`ori-acceptance-h4-greenfield`) をそのまま `workspace.apps[0].name` に書く
- sanitize は alphanumeric + hyphen に対しては no-op (今回は問題なく valid)
- ただし長すぎる名前 / 単語切り出しが希望と異なる場合がある (UX 改善余地)
- **対処方針**: 本 PR では fix せず、別 issue として carry-over 検討対象 (P3 / feature)
- main repo 側 carry-over: 別 PR で `ori-init` 対話パスに「app name を確認しますか?」prompt 追加検討

### F-2: SKILL.md `/ori-arch` の script invocation path が apm install 後の cwd に存在しない (mid)

- 現状の `.apm/skills/ori-arch/SKILL.md` は `node .apm/skills/ori-arch/scripts/render-architecture.js` を案内
- apm install consumer 側 cwd には `.apm/skills/` ディレクトリは無く、代替パスは:
  - `.claude/skills/ori-arch/scripts/render-architecture.js` (Claude Code 統合済)
  - `apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/render-architecture.js` (raw source)
- AI agent が SKILL.md をコピペ実行すると `Cannot find module` / `No such file` で失敗する恐れ
- **対処方針**: 本 PR で SKILL.md を docs-only fix (両 path を明示)。skill bundle 再ビルド不要 (`.apm/skills/ori-arch/SKILL.md` は build:skills の対象外、手書き source)
- 同様の修正は ori-arch SKILL.md の `## Architecture Export / Check スクリプト` セクションにも適用

### F-3: vite vanilla-ts には `pnpm test` script が無い (NEXT_SESSION.html 側の問題、skill ではない)

- NEXT_SESSION.html step 7 は「`pnpm test` (vite default の sample test) が通ること確認」と書かれているが、
  vite vanilla-ts template には test script が無く (`scripts: {dev, build, preview}` のみ)、sample test も無い
- 本 acceptance では `pnpm build` で代用 (TS valid + Vite が module transform 完走 = ほぼ等価な smoke)
- **対処方針**: NEXT_SESSION.html は session prompt なので別途修正不要 (毎セッション再生成)。
  ただし、ori-arch SKILL.md の「## 次のアクション」セクションでも `pnpm test` を勧めているので注意

### F-4: `@ori-ori/arch-adapter-eslint@0.2.0` の npm deprecate message が実機能と齟齬 (low)

- `npm view @ori-ori/arch-adapter-eslint deprecated` → 「Reserved for future use. Currently distributed via APM: apm install dev-komenzar/ori」
- しかし `export.js` 内では `require('@ori-ori/arch-adapter-eslint')` で npm モジュールを読み、実際に機能している (eslint.config dump 出力 OK)
- これは「npm 占有 publish + APM 配布」の両建て戦略 (memory: `npm_distribution`) からの帰結だが、deprecate message が「empty placeholder」を示唆するため UX 誤解を招く
- **対処方針**: npm side の deprecate message 修正 (publish 必要、本 PR スコープ外)。別 issue carry-over 候補

### F-5: `eslint.config.ori.js` ヘッダ「Regenerate with: ori arch export --adapter=eslint」が旧 CLI 経由案内 (mid)

- `@ori-ori/arch-adapter-eslint` が生成する出力ファイルの top comment が:
  ```
  // Regenerate with: ori arch export --adapter=eslint
  ```
  となっており、廃止された `ori` CLI を案内している
- 正しい案内は `node apm_modules/dev-komenzar/ori/.apm/skills/ori-arch/scripts/export.js --adapter=eslint` 相当
- 影響: ユーザが旧 CLI をインストールしようとして「CLI 廃止方針」(`ori-execution-model-shift-2026-06-03-ori`) と齟齬する
- **対処方針**: `packages/skills/ori-arch/adapters/eslint/` 配下の adapter ソース改変必要 → `build:skills` 再ビルド + 同 session verify が必要 → 閾値 (a) を超えるため本 PR では fix せず、別 PR / 別 issue で carry-over

## Carry-over (main repo 起票済)

| F-ID | 概要 | bd issue | type / priority |
|---|---|---|---|
| F-1 | `/ori-init` で app name 確認 prompt 追加 | `ori-gag` | feature / P3 |
| F-2 | SKILL.md `ori-arch` の invocation path 修正 — **本 PR で同梱 fix** | (本 PR scope) | — |
| F-3 | vite vanilla-ts 互換性: SKILL.md「次のアクション」の `pnpm test` 言及見直し | `ori-1gs` | bug / P3 |
| F-4 | `@ori-ori/arch-adapter-eslint` npm deprecate message を実態に合わせる | `ori-u5d` | bug / P3 |
| F-5 | `eslint.config.ori.js` ヘッダコメント (旧 CLI 案内) を skill 経由に修正 | `ori-0ok` | bug / P2 |

F-2 のみ本 PR に同梱 fix (`.apm/skills/ori-arch/SKILL.md` 編集)。残り 4 件は別 PR / 別 issue で対応。

## 判定

**ori-s44 (条件 ① + ②) は PASS — close 可**:
- S-1 〜 S-4 で apm install → /ori-init → upstream init → /ori-arch の三段構え動線が end-to-end でエラーなく完走
- target には `.ori/architecture.md` 1 ファイルのみが ori 由来として出力 (placeholder 解決 ✓、frontmatter valid ✓)
- bootstrap 系 (`package.json`, `tsconfig.json`, `index.html`, `src/`, ...) は全て vite vanilla-ts 由来で、`/ori-arch` skill 自身は apps/ 配下に一切ファイル書かない
- 軽微 friction 5 件 (うち F-2 は本 PR fix、4 件は carry-over)

条件 ③ は `ori-41z` (H4b) に deferred。`ori-s44` close 後に自動 ready 化、別 PR で 2-session pattern 検討含めて着手する。

## 参考

- `bd show ori-s44` — H4 main タスク詳細 (parent: `ori-5er`、blocks: `ori-41z`)
- `bd show ori-41z` — H4b タスク詳細 (条件 ③ 用、本 PR merge 後に ready 化)
- `docs/design.md` §17 — `/ori-arch` 三段構え責務分担 (本 acceptance で end-to-end 検証した動線)
- `docs/acceptance/ori-3ik-greenfield-2026-06-03-retry.md` — 旧テンプレ方式時代の acceptance log (雛形参照元)
