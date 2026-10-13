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

## 5. 再検証 (2026-10-07、ori 511333a)

ori-oan.7 (#121、testid を `testids.yaml` 契約に一本化) と ori-oan.8〜.11 (#122、XDG temp 隔離 / `!= null` 判定 /
`LD_LIBRARY_PATH`・:4444 / plugin 警告の基準) を merge した版で、同じ baseline から再実行した。

| 項目 | 値 |
|---|---|
| 日時 | 2026-10-07 15:28〜15:50 JST |
| ori | `511333a` (`apm.lock.yaml` の resolved_commit で確認。consumer の SKILL.md に `XDG_CONFIG_HOME` / `SevereServiceError` の記述があることも確認) |
| promptnotes branch | `chore/ori-oan-6-rerun` (未 push) |
| commit | `8b25163` baseline → `97438f0` ori を 511333a に更新 → `b17027c` `/ori-generate` の生成直後 → `46bccb6` 手修正 |
| 実行 | Linux / nix devShell / `env -u LD_LIBRARY_PATH npx wdio run wdio.conf.ts`。tauri-driver + WebKitWebDriver (webkitgtk 2.52.6)、wry 0.55.1 |

### 5.1 結果

| scenario | 生成直後 (`b17027c`) | 手修正後 (`46bccb6`) | 実行時間 (wall / mocha) |
|---|---|---|---|
| s1-note-created-happy | 0/4 (before all で RED) | 3/4 (step 3 が RED — app 不具合) | 12 秒 / 8.2 秒 |
| s2-autosave-debounce | 0/3 (before all で RED) | 3/3 pass | 7 秒 / 4.0 秒 |
| s11-storage-dir-change | 0/7 (before all で RED) | 7/7 pass | 10 秒 / 6.2 秒 |

生成直後の RED は 3 本とも `element ("[data-testid="page.page-main.*"]") still not existing after 20000ms`。
契約 testid が実装に存在しないことが原因。手修正後の s1 step 3 は前回の step 2 と同じ app 不具合
(`DraftRegion.svelte` が submit 後に新 Block へ focus を移さない。promptnotes 側の `ori-ry9h`) で、scenario 側は正しい。

**手修正ゼロでの GREEN は今回も未達。** ただし原因は ori の生成ロジックではなく、契約 testid と既存実装の乖離に移った。

### 5.2 判定

| 基準 | 判定 | 根拠 |
|---|---|---|
| (a) 3 scenario が生成物の手修正ゼロで GREEN | **未達** | 生成直後は 3 本とも RED (契約 testid が実装に無い)。手修正後も s1 は app 不具合 `ori-ry9h` で RED |
| (b) s2 の前後で `~/.config/com.komenzar.promptnotes` と `~/.local/share/com.komenzar.promptnotes` の mtime 不変 | **達成** | 生成直後・手修正後の 2 回とも、両 dir と直下の全 entry の `stat` が実行前後で一致 (`diff` が空)。手修正後は AutoSave の書き込みを含む全 step が走った上で不変。seed (`$ORI_SCENARIO_TMP/...`) がアプリに読まれていることは step 1 の表示 assertion で確認。実行後の `/tmp/ori-scenario-s*` の残留も 0 |
| (c) 起動から最初の reload まで plugin 警告 0 件 | **達成** | 6 回の実行すべてで 0 件。`Tauri plugin not available` は全実行で 0 件。`Failed to get window states` は 2 件で、s1 生成直後の 1 件は `deleteSession()` 後の終了処理中、s1 手修正後の 1 件は step 4 の `window.location.reload()` 直後 (許容範囲) |
| (d) 前回の手修正 2 種類が再発していない | **一部再発** | s11 の poll 判定: 再発なし (生成コードが最初から `!= null` で、手修正なしで GREEN)。testid: 形を変えて再発 (§5.3) |

ori-oan.8〜.11 の修正はそれぞれ効いている。.8 は (b)、.9 は (d) の poll 判定、.11 は (c) で確認した。
.10 は文書化どおり `env -u LD_LIBRARY_PATH` で実行し、:4444 の占有は起きなかった。

### 5.3 手修正

`46bccb6` (3 ファイル、+13/−14 行)。`git diff b17027c 46bccb6` が手修正の全量。
テストの `TID` 定数 (selector) だけを契約値から実装値に置き換えた。assertion / poll / seed / `wdio.conf.ts` は変えていない。
testid 以外の確認項目 ((b)〜(d)) を見るための修正。

| 契約 testid (生成値) | 実装 testid (置換後) |
|---|---|
| `page.page-main.draft-body` / `.block` / `.block-body` / `.toolbar-settings-button` | `screen-1-draft-body` / `screen-1-block` / `screen-1-block-body` / `screen-1-toolbar-settings-button` |
| `page.page-main.restart-prompt(-restart)` | `restart-prompt(-restart)` |
| `widget.widget-settings-modal.root` | `widget-settings-modal` |
| `widget.widget-settings-modal.storage-dir` / `.save` | `screen-2-storage-dir` / `screen-2-save` |
| `widget.widget-settings-modal.theme-option[data-key=X]` | `screen-2-theme-X` (実装は動的 testid) |

前回は「pattern から導出した testid と実装が違う」問題だった。今回は ori-oan.7 で testid が契約由来に統一され、
ori の動作としては正しい。ただし契約の値そのものが既存実装と一致していない。`testids.js check` の結果は
page-main 22/22、widget 5/5 が「契約 testid が実装に存在しません」で、実装側の形式違反も 4 件ある
(動的 testid `screen-1-toolbar-date-range-${key}` / `screen-2-theme-${value}`、`_` を含む `screen-1-toolbar-sort-field-created_at` など)。

テストコードは本検証の agent が skill の記述どおりに生成した。生成時には前回の手修正 (`75c613a`) を参照していない。

### 5.4 新しく見つかった問題

| 分類 | 内容 | 扱い |
|---|---|---|
| ori 側 (高) | testid 契約と既存実装の乖離を埋める移行経路が無い。既存 app では scenario が必ず RED になる。`check` の結果は impl-notes に記録されるだけ。(a) を阻む主因 | ori-oan.13 (ori-oan.6 の blocker) |
| ori 側 (軽微) | `testids.js add-extra` が `extra:` を崩れた flow style で書き出す (parse は可能) | ori-oan.14 |
| ori 側 (軽微) | SKILL.md が `node .apm/skills/ori-flow/scripts/scenario-status.js` と `.apm/instructions/scenario*.instructions.md` を参照するが、consumer では `.claude/skills/` / `.claude/rules/` に展開されている | 既存の ori-qh3 に ori-generate と instructions 参照を追記 |
| app 側 | s1: submit 後に新 Block へ focus が移らない (I-PM9 違反、前回から未修正) | promptnotes `ori-ry9h`。ori には起票しない |
| app 側 (軽微) | `src/app.html` に `<title>` が無く、tauri-service が `Could not find window with title containing "PromptNotes"` を大量に出す (s1 9 / s2 26 / s11 59 件)。成否と判定基準には影響しないが、ログのノイズになる | 記録のみ |
| app 側 (移行作業) | 手修正ゼロの GREEN には、app の testid を契約へ移行する作業が要る (app の unit test の `screen-1-*` 参照にも波及) | 記録のみ (ori-oan.7 Q12 の方針どおり promptnotes 側で扱う) |
| 環境 | promptnotes devShell の `bd` が古く (`database is at v66, binary knows up to v53`)、`bd update ori-generate-<id>` を実行できなかった。`status.yaml` は更新済み | 記録のみ |

### 5.5 test_support.rs (`TAURI_TEST_STORAGE_DIR`) について

検証者の意見は「将来は削除すべきだが、今すぐは消さない」。promptnotes 側の判断事項として記録する。

- 削除してよい根拠: 今回の 3 scenario は `TAURI_TEST_STORAGE_DIR` を使わない XDG 隔離だけで正しく動いた。
  env を読む test seam が production コードの 4 箇所に残っており、`debug_assertions` で gate されていない
- 今すぐ消さない根拠: `.ori/scenarios/` の旧世代 `wdio.conf.ts` 18 本がまだこの env を注入している。
  いま消すと、それらが実ユーザーの領域に書き込む
- 推奨手順: 残りの scenario を ori 511333a 以降で再生成 → `grep -r TAURI_TEST_STORAGE_DIR .ori/scenarios` が 0 件を確認 → test_support.rs と呼び出し 4 箇所を別 PR で削除

### 5.6 次の手順

ori-oan.6 は close しない。(a) と (d) の testid が未達で、blocker は ori-oan.13 (移行経路) と
promptnotes 側の testid 移行・`ori-ry9h`。これらの解消後、同じ baseline (`8b25163`) から再実行する。

## 6. 3 回目の再検証 (2026-10-13、ori 03b3486)

§5 の blocker (ori-oan.13 の移行経路と、promptnotes 側の testid 移行・フォーカス規定) を解消した後に、
promptnotes main から作り直した baseline で再実行した。

| 項目 | 値 |
|---|---|
| 日時 | 2026-10-13 16:09〜16:30 JST |
| ori | `03b3486` (`apm.lock.yaml` の resolved_commit。ori main 最新と同じ) |
| promptnotes 起点 | main `d1dd991` |
| promptnotes branch | `dev-komenzar/pn-oan6-rerun3` (未 push) |
| commit | `255677e` baseline → `82e5ab6` `/ori-generate` の生成直後。手修正の commit はない |
| 実行 | Linux / nix devShell / 実 DISPLAY `:0` / `env -u LD_LIBRARY_PATH npx wdio run wdio.conf.ts`。tauri-driver + WebKitWebDriver (webkitgtk 2.52.6)、wry 0.55.1 |

baseline `255677e` は `8b25163` と同じ考え方で作った。Rust の WDIO 配線 3 箇所と、3 scenario の生成物
(`tests/` / `wdio.conf.ts` / `tsconfig.json` / `review.md`) を除き、`notes.md` / `status.yaml` を derive done に戻した。
`spec.md` と `manifest.yaml` は触っていない。

### 6.1 前回からの変化

| 側 | 変更 | 内容 |
|---|---|---|
| ori | #124 / #127 / #129 / #130 / #131 | ori-oan.13 (testid 移行経路)、.13.4 (機能欠落の経路)、.13.5 (未契約 testid の一覧)、.15 (`extra` の block style 正規化)、.13.6 (移行手順への参照を consumer で解決) |
| promptnotes | #418 | ori を `03b3486` に更新 |
| promptnotes | #419 | testid 移行 PR-P1。既存実装の testid を契約値 (`page.page-main.*` / `widget.widget-settings-modal.*`) に移行 |
| promptnotes | #421 | Draft フォーカス規定の変更 PR-P2。確定後もフォーカスは Draft 本文に残り、新しい Block は IDLE。前回 s1 を RED にしていた ori-ry9h (closed) は規定の変更で解消 |

生成は新しいコンテキストの subagent が行った。検証セッションは前回の手修正 (testid の読み替え表など) を知っているので、
生成者のバイアスを避けるためにそうした。subagent には、過去の生成物 (git 履歴・他 worktree・旧世代テスト) と
前回レポートの参照、実装に合わせた testid の読み替えを禁止した。`check-page-testids.sh` は `--emit-issues` なし、
phase issue の `bd update` は省略した (どちらも bd に書かないためで、生成内容には影響しない)。

### 6.2 結果

生成直後 (`82e5ab6`) のまま 3 回ずつ実行した。

| scenario | run1 | run2 | run3 | 実行時間 (run1: wdio Spec Files / mocha) |
|---|---|---|---|---|
| s1-note-created-happy | **7/7** | 7/7 | 7/7 | 6 秒 / 4.5 秒 |
| s2-autosave-debounce | **6/6** | 6/6 | 6/6 | 5 秒 / 3.3 秒 |
| s11-storage-dir-change | **7/7** | 7/7 | 7/7 | 11 秒 / 8.8 秒 |

- `test-points-map.md` は全行 COVERED (s1 11 行 / s2 6 行 / s11 7 行)。`tsc --noEmit` は 3 本とも exit 0
- `testids.js sync` は page-main (derived 22 / extra 17)、widget-settings-modal (derived 6 / extra 2) とも up-to-date。`add-extra` は不要だった
- `check-page-testids.sh --implemented-only` の違反は既知の 2 件だけ (`page.page-main.block-updated-at`、`widget.widget-settings-modal.storage-dir-reset`)。3 scenario では使っていない
- s1 の追加確認「確定後もフォーカスが Draft 本文に残り、新しい Block は IDLE」は 3 回とも通過。#421 の Then の変更が derive → generate → 実装まで一貫して通った

### 6.3 判定

| 基準 | 判定 | 根拠 |
|---|---|---|
| (a) 3 scenario が生成物の手修正ゼロで GREEN | **達成** | `82e5ab6` のまま s1 7/7、s2 6/6、s11 7/7 が 3 回とも GREEN。手修正の commit はなく、`build:test` 後の `git status` も clean |
| (b) s2 の前後で実ユーザー領域の mtime 不変 | **達成** | s2 の 3 回すべてで前後の `stat` の `diff` が空。値はセッション開始時の snapshot、§5.2 の値とも一致。s1 / s11 の 6 回も不変。`/tmp/ori-scenario-<id>-*` の残留なし |
| (c) 起動から最初の reload まで plugin 警告 0 件 | **達成** | 9 回すべてで 0 件。`Failed to get window states` が出たのは 2 回 (s1 run3 の step 7 `window.location.reload()` 直後、s11 run1 の `restart-prompt-restart` click から 52ms 後)。どちらも reload / 再起動直後で許容範囲 |
| (d) 前回の手修正 (testid の読み替え、poll の判定) が再発しない | **達成** | testid: 3 本が使う selector はすべて契約値で、`screen-[12]-*` などの旧 testid は 0 件。poll: `browser.execute` の戻り値は全箇所 `!= null` で判定し、`!== undefined` / `=== undefined` は 0 件 |

### 6.4 新しく見つかった問題

起票はしていない。ori 側の 4 件の扱いは別途決める。

| 分類 | 内容 |
|---|---|
| ori 側 (軽微) | SKILL.md と生成された impl-notes の testid-migration リンクが `../../../apm_modules/dev-komenzar/ori/.apm/instructions/...` を指す。`apm_modules/` は gitignore されており、`apm install` していない worktree では解決しない (生成 subagent は同内容の `.claude/rules/scenario-test.md` で代用した)。ori-qh3 / ori-oan.13.6 の方針と照らして確認が要る |
| ori 側 (軽微) | scenario-test 規約の「テスト間独立 (順序依存禁止)」は、1 spec = 1 app session の wdio では満たせない。生成テストは Given → When → Then の順に依存している。wdio scenario では step 間の依存を許すと明記した方が生成がぶれにくい |
| ori 側 (軽微) | SKILL.md の `tsconfig.json` 出力規定が playwright の項にしかなく、wdio 用 types の例は別段落。subagent は wdio でも出力すると判断した (妥当) が、wdio の項にも明記するとよい |
| ori 側 (軽微) | s2 のタイミング判定 (起点は `browser.keys` から戻った時刻、上限 700ms) は遅い環境 (CI) で flaky になりうる。測定値がログに出ないので余裕は未確認。タイミング assertion の許容幅の決め方 (test-points に従うか、余裕を持たせるか) を生成規約で決めておくとよい |
| app 側 (軽微) | `src/app.html` に `<title>` が無く、tauri-service が `Could not find window with title containing "PromptNotes"` を出す (run1 で s1 14 / s2 14 / s11 70 件)。§5.4 から継続。成否には影響しない |
| app 側 (派生文書) | s1 / s2 / s11 の `spec.md` に前の世代の記述が残る。s1 の test-points の `screen-1-draft-body` / `[data-block-id]`、s1 impl-notes の「`nix build` → binary」、s11 impl-notes の `[data-testid="widget-settings-modal"]` / `restart-prompt`、s2 impl-notes の「合計 600〜800ms 目安」(test-points の 500〜700ms と食い違う)。生成側は契約値と test-points を優先して正しく読み替えた。次回の derive で整えるとよい |
| app 側 | #421 で付いた s1 の dirty mark (`validation.md#s1-note-created-happy`、`affected_phase: derive`) が、spec.md 更新済みなのに main の `status.yaml` に残っていた。今回は baseline で解除した。main 側でも finalize が要る |
| app 側 (既知) | testid の機能欠落 2 件 (storage-dir-reset: ori-fo5n / ori-8uso、block-updated-at: ori-6lvx / ori-1jjr) は未解消のまま。今回の 3 scenario には無関係 |
| 環境 | 前回と同じく `env -u LD_LIBRARY_PATH` で実行した (ori-oan.10 の回避策。付けない場合は未確認)。:4444 の残留はなく `pkill` は不要だった。`/tmp/ori-scenario-smoke` (2026-10-02 作成) が残っているが、今回の実行で作られたものではない |

### 6.5 close についての結論

ori-oan.6 / .8 / .9 / .11 / .13 は close 可能。

| issue | 根拠 |
|---|---|
| ori-oan.6 | (a)〜(d) とフォーカス規定の追加確認をすべて達成。生成直後のまま 3 本 × 3 回 GREEN |
| ori-oan.8 (XDG 隔離) | 3 本の `wdio.conf.ts` が XDG を per-run temp に隔離し、`TAURI_TEST_STORAGE_DIR` の注入は 0 件。9 回とも実ユーザー領域の mtime 不変。s11 は seed した storage_dir の変更と再起動後の反映まで GREEN |
| ori-oan.9 (poll の null 判定) | 生成コードは全箇所 `!= null`。s11 の再起動検知 poll (`__oriBeforeReload == null`) を含め手修正なしで GREEN |
| ori-oan.11 (reload 直後の警告) | 起動から最初の reload までは 9 回とも 0 件。出た 2 件は reload / 再起動の直後 (52ms 以内) で、instructions の許容規定どおり |
| ori-oan.13 (testid 移行経路) | ori 側の移行経路 (#124 ほか) と promptnotes 側の移行 (#419) を経て、契約値だけのテストが既存実装で GREEN。残る機能欠落 2 件は app 側の issue で追跡されており、ori 側の blocker ではない |

注意点:

- テストの生成は AI (新しいコンテキストの subagent) が行った。同じ入力に対して毎回同じテストが出る保証は無い
- s2 の 700ms 上限は、遅い環境で flaky になる可能性がある (§6.4)
- ori-oan.10 (`LD_LIBRARY_PATH` / :4444) は close 対象に入れていない。回避策は引き続き使った
- ori-oan.13 の子 ori-oan.13.7 (ui-fields にあるが spec に挙動規定が無い要素の検出) は open のまま。ori-oan.6 の達成には関係しない
