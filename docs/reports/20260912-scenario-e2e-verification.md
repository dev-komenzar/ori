# scenario E2E 実行基盤の検証で判明したハーネス側の gap — レポート

> ori v0.5.0 の scenario（cross-service E2E 検証単位）を consumer リポジトリで
> 実際に実行検証した際に、ori が生成する scenario 実行基盤だけでは GREEN に
> 到達できない箇所が複数判明した。本レポートは状況と原因を記録する。
>
> - 日時: 2026-09-12
> - consumer リポジトリ: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - ori version: unreleased (main HEAD、`apm update dev-komenzar/ori`)
> - 検証対象: `.ori/scenarios/s1` 〜 `s5`（`new-scenario.js` + `/ori-flow` で生成）
> - agent: Sisyphus (OpenCode / DeepSeek v4 Pro)

## 1. 検証結果の要約

`/ori-flow <scenario-id>`（4 phase: derive → generate → review → finalize）で
5 scenario を生成し、実際に wdio + tauri-driver + WebKitWebDriver で実行した。

| scenario | 生成物 | 実行結果 |
|---|---|---|
| s1-note-created-happy | ✅ | 2 passing |
| s2-autosave-debounce | ✅ | 2 passing（skeleton を実 UI テストへ手修正） |
| s3-flush-on-blur | ✅ | 2 passing / 1 failing |
| s4-tag-assign-normalize | ✅ | 1 passing（skeleton のまま） |
| s5-delete-undo-in-window | ✅ | 0 passing / 1 failing |

生成・review は全 scenario PASS（review.md verdict=PASS）だったが、
**実行（E2E）に到達すると複数の前提が欠けていた**。

## 2. 判明した gap

### G1: `tauri-plugin-wdio` が wdio.conf.ts に反映されない（最重要）

`@wdio/tauri-service`（v1.4.0）は `tauri-plugin-wdio` を **required** としている
（`docs/plugin-setup.md`: "The `tauri-plugin-wdio` is a **required** Tauri plugin"）。

plugin 未登録の場合、service の `beforeCommand` が focus 系コマンド
（`$`, `$$`, `findElement`, `findElements`, `elementClick`, `getTitle`）ごとに
`window.wdioTauri` を **5 秒待機**してから諦める。この 5 秒 × コマンド数が累積し、
time-sensitive な検証（toast の 5 秒 TTL 等）が成立しない。

- 証跡: app log に `Failed to get window states: Error: Tauri plugin not available...`
  が 5〜6 秒間隔で記録される
- 影響: s5 では delete 成功後に toast を検証する時点で TTL が経過し toastCount=0。
  s3 では累積が mocha timeout を超過
- 一方 `/ori-generate` が生成する `wdio.conf.ts` は
  `services: [['@wdio/tauri-service', { driverProvider: 'external' }]]` のみで、
  plugin の存在を要求・検証しない。Tauri app 側への plugin 追加手順も
  scenario の成果物として生成されない

### G2: build コマンドが debug binary の実体と一致しない

`architecture.md` の `workspace.apps[].runtime.build` は consumer が設定するが、
`cargo build` と `cargo tauri build --debug --no-bundle` は **異なる binary** を生成する。

- `cargo tauri build --debug --no-bundle` → `frontendDist` を埋め込んだ binary
- `cargo build` → `devUrl`（例 `http://localhost:5173`）を参照する dev binary

`cargo build` で生成した binary を `tauri:options.application` に渡すと、
app は dev server に接続しようとして `Connection refused` になる。
scenario の impl-notes には「事前に `tauri build --debug --no-bundle`」と
記述されるが、**incremental に `cargo build` で再ビルドした場合の危険**は
明記されていない。

### G3: scenario ディレクトリから app の node_modules を解決できない

生成テストは `.ori/scenarios/<id>/tests/*.spec.ts` に配置され、
`import { browser, $, $$ } from '@wdio/globals'` 等を行う。

Node の ESM 解決は spec ファイルの位置から上方探索するため、
`.ori/scenarios/` から `apps/<app>/node_modules` を解決できず
`Cannot find module '@wdio/globals'` で **spec のロード自体が失敗**する。

- `/ori-generate` は symlink / workspace 設定 / NODE_PATH 等の解決機構を生成しない
- ori の「scenario ディレクトリは self-contained」原則と、
  依存解決が app 側 node_modules にある事実が噛み合っていない

### G4: `storage_dir` の test 隔離が生成物に含まれない

`/ori-generate` は `onPrepare` に compose lifecycle を書くが、Tauri local app の
場合に **テスト用 storage_dir を inject する手段**を生成しない。

- app は `app_config_dir/settings.json` の `storage_dir` を優先するため、
  環境変数で「default だけ」を上書きしても効かない
- consumer 側で override を実装する必要がある（promptnotes では
  `load_settings` / `list_feed` / `change_sort_order` / `note_capture::shared::storage`
  の 4 箇所すべてに適用が必要だった）
- 未対応のまま実行すると **実ユーザーデータ（304 件の .md）を読み込んで**テストが走る

### G5: 生成テストの selector が ui-fields の field id と一致しない

`/ori-generate` が生成したテストは `draft-input` / `note-block` / `delete-btn` /
`undo-toast` 等の **generic な testid** を使う。

一方、実装（および `domain/ui-fields/screen-N.md` が定義する field id）は
`screen-1-draft-body` / `screen-1-block` / `screen-1-block-delete` /
`screen-1-toast` / `screen-1-toast-undo` である。review は spec↔test の
整合性のみを見るため、**実装の field id との照合はされず PASS になる**。

- field id の正典は `domain/ui-fields/*.md`（`field id: <screen>-<region>-<purpose>`）
  だが、generate はこれを参照していない
- review phase は「生成物同士の整合」を見るため、実装との乖離を検出できない

### G6: fixture seed 機構が生成されない

s2/s3/s5 は「既存 Note が storage にある」前提のシナリオだが、
生成される `onPrepare` は空の temp dir を作るだけで **fixture を seed しない**。

- 正しい `.md` frontmatter 形式（`createdAt: YYYYMMDDhhmmss`、ISO 8601 ではない）を
  consumer が知らないと seed を誤る
- seed が無いと `blocks.length >= 2` 等の前提が崩れ、テストが成立しない

## 3. consumer 側で必要だった手修正

| gap | promptnotes での対応 |
|---|---|
| G1 | **未解決**（`tauri-plugin-wdio` の導入判断が未確定。production への混入回避策を含め要検討） |
| G2 | `bun run tauri build --debug --no-bundle` を正とした |
| G3 | `.ori/scenarios/node_modules` → `apps/promptnotes/node_modules` の symlink |
| G4 | `TAURI_TEST_STORAGE_DIR` を 4 箇所の settings 解決に優先適用 |
| G5 | テストの selector を `screen-1-*` へ手修正 |
| G6 | `onPrepare` に seed 関数を追加 |

commit: `964db65` / `711f19e`（branch `chore/update-ori-scenario`）

## 4. 環境情報

- consumer: `promptnotes` (Tauri v2, SvelteKit, Rust backend)
- runner: wdio（`@wdio/tauri-service` v1.4.0、`driverProvider: 'external'`）
- driver: `tauri-driver`（`~/.cargo/bin`）+ `WebKitWebDriver`（webkit2gtk）
- binary: `bun run tauri build --debug --no-bundle` の `target/debug/app`
- agent: Sisyphus (OpenCode / DeepSeek v4 Pro)
