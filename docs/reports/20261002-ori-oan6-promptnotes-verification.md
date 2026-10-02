# scenario E2E 実行基盤 (ori-oan) の promptnotes 再検証 — レポート

> PR #66 (ori-oan W0〜W4) の harness 変更で、ori の生成物だけで scenario E2E が
> GREEN に到達するかを promptnotes で再検証した (ori-oan.6)。
>
> - 日時: 2026-10-02
> - consumer リポジトリ: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - ori version: main `b193c66` (`apm.yml` で `dev-komenzar/ori#<sha>` に pin)
> - 検証対象: `s1-note-created-happy` / `s2-autosave-debounce` / `s11-storage-dir-change`
> - 作業場所: promptnotes worktree `promptnotes=ori-oan-6` (branch `chore/ori-oan-6-baseline`、未 push)

## 1. 手順

「手修正ゼロ」の定義: ori が生成したファイル (テスト / runner config / Rust 配線 patch) は手で編集しない。
入力側 (`architecture.md` 等) は ori skill を通す更新なら可。

| commit | 内容 |
|---|---|
| `e2ce767` | ori を `b193c66` に更新 (`apm install`) |
| `8b25163` | クリーン baseline: Rust の WDIO 配線 (Cargo dep / `wdio:default` / `lib.rs` 登録) と、3 scenario の生成物・`notes.md`・`review.md` を除去。`status.yaml` を derive done に戻す |
| `0bf87e3` | `/ori-generate` の生成直後 |
| `75c613a` | GREEN 到達のための手修正 (`git diff 0bf87e3 75c613a` が手修正の全量) |

frontend の `wdio-test-setup.ts`、`build:test` script、`test_support.rs` (`TAURI_TEST_STORAGE_DIR` を読む処理) は、
ori が生成しない app 側の要件なので baseline に残した。

## 2. 結果

| scenario | 結果 | 実行時間 |
|---|---|---|
| s1-note-created-happy | 3/4 pass (step 2 が RED — app 不具合) | 7 秒 |
| s2-autosave-debounce | 3/3 pass | 8 秒 |
| s11-storage-dir-change | 6/6 pass | 10 秒 |

**手修正ゼロでの GREEN は未達。** 手修正は 2 種類 (testid と s11 の poll 判定) で、どちらも小さい修正で済んだ。
s1 step 2 は「作成後に新規 Block へ focus が移る」という仕様を app (`DraftRegion.svelte`) が満たしていないためで、
scenario 側は正しい (promptnotes 側の `ori-ry9h`)。

### 2.1 PR #66 で解消を確認したもの

| gap | 確認内容 |
|---|---|
| G1 plugin 配線 | `lib.rs` への登録は `#[cfg(debug_assertions)]` の中だけ。log plugin を chain の先頭へ移動。`Tauri plugin not available` は 0 件 |
| G2 build | `build:test` で作った binary で起動できた |
| G3 node_modules | symlink を冪等に作成 |
| G6 seed | s11 の fixture seed を `onPrepare` で生成 |
| 待機 | 5 秒待機は 0 件 (計 796 command 中、間隔 4.5 秒超は 0 箇所) |
| production 非混入 | release binary 内の `tauri_plugin_wdio` は 0 件 (debug 版は 852 件)。capability の権限表に文字列が 1 件残るが、plugin を登録していないため機能しない。release 用 frontend `build/` に wdio 関連文字列は 0 件 |
| 型 | 生成物の `tsc --noEmit` は 3 scenario とも exit 0 |

`build_features` は W2 で不要と決定済みで、今回も必要にならなかった。

## 3. 残った gap

| id | 種別 | 内容 |
|---|---|---|
| ori-oan.7 | 手修正 (3 scenario) | testid の乖離 (G5 の再発)。生成テストは pattern.md 規約の `page.<page-id>.<elem>` を使ったが、実装は ui-field id (`screen-1-draft-body`) をそのまま testid にしている。正典をどちらにするかの決定と、生成前に乖離を検出する仕組みが必要 |
| ori-oan.9 | 手修正 (s11) | 結果の poll が `undefined` 判定。WebDriver は `undefined` を `null` で返すため待ちがすぐ終わり、`null.ok` でエラー。`!= null` 判定を規約にする |
| ori-oan.8 | 生成時に回避 | storage 隔離 (G4)。template は常に `TAURI_TEST_STORAGE_DIR` を設定するが、s11 の spec はこれを禁じている。また、この env だけでは settings / window-state が実ユーザーの領域に書き込まれる。XDG temp による隔離を標準にする必要がある。`runtime.test_env` は実行ごとの temp dir を表現できない |
| ori-oan.11 | 成功基準 | reload / 再起動の直後に `Failed to get window states` (`window.wdioTauri` undefined) が一時的に出る (s1・s11 で各 1 件)。基準を緩めるか、待機用 helper を規約にするかの決定 |
| ori-oan.10 | 実行環境 | devShell の `LD_LIBRARY_PATH` が残ると WebKitWebDriver が `GLIBC_2.44 not found` で起動しない。失敗後に残った tauri-driver が :4444 を占有する。ori-7c1 (CI 化) と関連 |

## 4. 次の手順

ori-oan.7 / .8 / .9 / .11 を ori-oan.6 の blocker とした。これらを解消した後、
同じ baseline (`8b25163`) から ori を更新して再生成・再実行し、手修正ゼロで GREEN になることを確認して ori-oan.6 を close する。
