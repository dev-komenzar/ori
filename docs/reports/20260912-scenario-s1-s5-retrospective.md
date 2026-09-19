# scenario s1〜s5 振り返りと ori ハーネス改善フィードバック — レポート

> consumer リポジトリ `promptnotes` で scenario `s1`〜`s5` を
> 「実行 GREEN 確認 → 乖離解消 → 台帳/テスト/review の是正」まで通した際に判明した
> ori ハーネス側の構造的 gap と、その場で実施した対策を記録する。
> 実行基盤そのものの gap（plugin / binary / node_modules / storage_dir / selector / seed）は
> 別レポート `20260912-scenario-e2e-verification.md` (G1–G6) を参照。本レポートは
> **進捗台帳・review の鮮度と信頼性・spec↔impl 乖離の可視性・生成テストの品質** に焦点を当てる。
>
> - 日時: 2026-09-12
> - consumer: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - ori version: unreleased (main HEAD)
> - branch: `chore/update-ori-scenario`
> - 検証対象: `.ori/scenarios/s1`〜`s5`（全 5 scenario）
> - agent: Sisyphus (OpenCode / DeepSeek v4 Pro)

## 1. 概要

s1〜s5 は**すべて E2E を実行すると GREEN** だったが、それは「正しさの証明」ではなかった。
GREEN の裏に以下が隠れていた。

1. **phase 進捗台帳 (status.yaml) の欠落/不統一** — commit は「4 phase 完走」と主張するのに
   台帳に phase が無い、または schema が scenario ごとにバラバラ
2. **review.md の陳腐化・誤審・破損** — 生成物が後から変わっても review は再実行されず、
   誤った検証を PASS にし、s5 では AI のツールコールがそのまま混入していた
3. **spec ↔ impl 乖離がテスト未検証で不可視** — ドメインが定めた挙動が未実装でも、
   テストが assert していないため PASS する
4. **生成テストの品質問題** — 実カバレッジが低い（s2/s3）、アプリに触れない空テストが
   vacuously PASS（s4）、WDIO 型の tsc エラー（s3/s4/s5）

これらは個別の consumer 事情ではなく、**ori の scenario ライフサイクルに
「書き込み・無効化・検証の担い手」がいない**ことに由来するハーネス側の構造問題である。

## 2. 対象 scenario と最終状態

| scenario | 実行(初期→最終) | 検出した主な問題 | 最終状態 |
|---|---|---|---|
| s1-note-created-happy | 2 passing | status 台帳全欠落 / `Cmd+N` 未実装かつ未検証 | 実装 + focus 検証 + Pass 2 |
| s2-autosave-debounce | 2 passing | finalize 欠落 / review 全面陳腐化 / debounce 500↔600 / test-points 2/6 | 500ms 整合 + テスト強化 + Pass 2 |
| s3-flush-on-blur | 3 passing | finalize 欠落 / review 誤検証(binary path) / test が state 遷移のみ | テスト実質化 + 誤審訂正 |
| s4-tag-assign-normalize | **2 passing(空)**→2 passing(実) | **アプリに触れない空テスト** / review が誤って PASS / phases 空 | UI 駆動に置換 + 実施記録 |
| s5-delete-undo-in-window | 1 passing | **review.md に tool-call 破損** / test tsc エラー / schema 不統一 | 破損修復 + tsc 修正 + schema 統一 |

## 3. 問題 / 原因 / 対策

### P-A. scenario phase 台帳 (status.yaml) の欠落・不統一 {#p-a-ledger}

**問題**
- s1: `phases: {}` / `completion: []`（commit `7309b45` は「全4phase完走」と明記）
- s2: `completion`/`phases` に `finalize` が無い（commit `64d12fb` は「4phase完走」）
- s3: `completion` に finalize はあるが `phases` に無い
- s4: `phases: {}`（そもそも真に未完了だった）
- s5: phase は全記録だが `completed` vocab + `beads` 無し（他は `closed` + beads）
- → **scenario 間で schema が 4 通りに分裂**。

**原因（ルートコーズ）**
1. `new-scenario.js` は `status.yaml` を空で scaffold するが、**その後の phase 更新を
   書き込む主体が存在しない**。scenario の phase skill の SKILL.md に status 更新手順が無く、
   AI の ad-hoc 更新に依存 → 抜け・表記ゆれが発生。
2. commit メッセージ（人間/AI が書く）と台帳（機械可読）が二重管理になり drift。
3. `/ori-doctor` の `check-slice-schema.sh` は `.ori/slices/` のみで、**scenario の
   status schema / phase 整合を検査しない**。

**対策（consumer）**: s1 `9a917dd` / s2 `2fe492a` / s3 `00ee57c` / s4 `6ca44be` /
s5 `4124af1` で台帳を復旧・統一（成果物の実在 + review verdict=PASS を根拠に記録）。

**提案**: §4 R1 / R2 / R12。

### P-B. review.md の陳腐化 {#p-b-review-stale}

**問題**
- s2: 「テストは skeleton / storage_dir injection 未実装 / page-main 未完了 / deps 未 install」
  と記述。現物は seed 付き実テスト + 実装済みで、本文が実態と完全乖離。
- s1/s3/s5: review 内の記述（deps 未 install / binary path / tsc）が後に解消されても更新されず。
- 陳腐化した PASS が残り「レビュー済み」の外観を保つ。

**原因**: `review.md` は監査ログとされ、**派生ファイル変更に対する無効化機構が無い**。
scenario の `status.yaml.dirty` は常に `[]` で実質未使用。`/ori-doctor` も scenario の
「review が test より古い」を検出しない。

**対策**: s1 `d17cb5a` / s2 `2fe492a` / s3 `00ee57c` / s5 `4124af1` で review に Pass 2 を追記。

**提案**: §4 R2 / R3。

### P-C. spec ↔ impl 乖離がテスト未検証で不可視 {#p-c-divergence}

**問題**
- **s1 `Cmd+N`**: `ui-fields#cross-screen-shortcuts` / `screen-1.md` が「`Cmd+N` で Draft に
  focus」と規定。実装の window keydown は `Cmd+Z` のみ。scenario test は `Ctrl+N` 直後に
  `click()` しており focus を assert していなかった → 未実装でも PASS。
- **s2 debounce**: domain/README が **500ms**、実装 `Block.svelte` は **600ms**。E2E は
  `pause(900)` 後の状態のみ → 500/600 いずれでも PASS。
- **s3 flush**: test が `data-block-state` の IDLE 遷移しか見ず、**flush の永続化・
  debounce 前発火を一切検証していなかった**。

**原因**
1. `/ori-generate` は `Then` 句の各項目を assertion に対応付けることを強制しない。
   happy-path の状態確認だけを書くと、focus / タイミング / 副作用が抜ける。
2. `/ori-review` の severity が裁量的で、`Then` 未検証が PASS を妨げない（s1 で LOW 扱い）。
3. ui-fields の field contract（ショートカット等）と page spec の test-points の対応を
   機械検証する仕組みが無い。

**対策**: s1 `4fe279b`（Cmd+N 実装）+ `d17cb5a`（focus assert）/ s2 `6ce4da6`（500ms 修正）/
s3 `00ee57c`（永続化・timing・no-op を assert）。

**提案**: §4 R4 / R5 / R9。

### P-D. 生成テストの test-points 未カバー {#p-d-coverage}

**問題**
- s2: `spec#test-points` 6 項目中、実質 2 項目のみ（timing/event/sort 未検証、冪等性は弱い）。
- s3: 4 項目中、実質 0〜1（永続化・timing・no-op すべて未検証）。

**原因**: test-points ↔ テストケースの網羅対応を機械検査していない。review は意味的乖離のみを
見るため未カバーは LOW で通過。

**対策**: s2 `2fe492a` / s3 `00ee57c` で timing / 永続化 / no-op / sort を追加。

**提案**: §4 R4 / R5。

### P-E. 付随する schema / ドキュメント drift {#p-e-drift}

| # | 事象 | 詳細 |
|---|---|---|
| E1 | `validation.md` 期待と不在 | instructions/SKILL は derive 成果物に挙げるが実在せず、Gherkin は `spec.md` 内包 |
| E2 | `spec.md` の `hash` schema 不統一 | s2 は placeholder（section id）、s3 は `runner`/`trigger` 非標準フィールド、s4 は hash 無し。s1 は `derives_from` のみ |
| E3 | `/ori-sync --force` 記述の残存 | instructions は「テスト直接編集に --force 必要」と書くが、AGENTS/docs では廃止済み |
| E4 | scenario tsconfig の tsc が常に失敗 | `wdio.conf.ts` の `'tauri:options'` 型エラーが既知で毎回出る |
| E5 | status.yaml schema 分裂 | `closed` vs `completed`、`beads` 有無（P-A） |

**対策**: s3 `00ee57c` / s4 `6ca44be` / s5 `4124af1` で hash / frontmatter / schema を是正。

**提案**: §4 R6 / R7 / R12。

### P-F. reviewer agent のタイムアウト {#p-f-reviewer-timeout}

**問題**: `/ori-review` の scenario workflow で `ori-reviewer` agent を fresh context で
spawn したところ **30 分 inactivity timeout で応答なし・成果物なし**。main session の
objective 検証で代替した。

**原因**: scenario review は入力が少ないのに reasoning モデル agent を起動する。失敗時の
フォールバック（main-session review へ降格）が SKILL に定義されていない。

**提案**: §4 R8。

### P-G. review の誤審 — 誤った検証を PASS にする {#p-g-review-false-pass}

**問題**
- s3: review が `tauri:options.application` を `target/debug/promptnotes` と記載し
  「runtime binary と一致 ✓」と判定。実バイナリは `target/debug/app`（architecture.md も
  修正済み）。**誤ったパスを ✓ にした**。
- s4: review が「Step 1/2 がテストコードでカバー」「整合性に問題なし」と **PASS**。当該テストは
  アプリに一切触れない空テスト（P-H）。自ら「skeleton」と書きながら PASS にした。

**原因**: scenario review の semantic 判定が「生成物同士（spec ↔ test）」の整合に閉じており、
**実装・実バイナリ・実 DOM との突合をしない**。また指摘 severity が裁量的で、
カバレッジ欠落を LOW/non-blocking に落とせる。

**対策**: s3 `00ee57c` / s4 `6ca44be` で review に Pass 2 を追記し、誤審を明示的に訂正。

**提案**: §4 R4 / R13。

### P-H. 空テスト / vacuously PASS {#p-h-empty-test}

**問題（s4）**: テストがアプリに一切触れていなかった。
- `before()` がテスト自身の `mkdtempSync` に `.md` を書き、**アプリの storage_dir
  （onPrepare が作る別 tmpDir）とは無関係**。
- `When`（IPC invoke）は**すべてコメントアウト**、step2 は **assert ゼロ**。
- 結果: **92ms で 2 passing** = 何も検証していない。これを review が PASS（P-G）。

**原因**: `/ori-generate` が「テストが実際に対象アプリを起動・操作しているか」を検証しない。
テストが trivially pass しても review は検出できない。lifecycle/接続の確証が無い。

**対策**: s4 `6ca44be` で UI 駆動に置換（seed + タグ入力操作 + ファイル/チップ assert）。

**提案**: §4 R13 / R14。

### P-I. review.md の破損（AI tool-call の混入） {#p-i-review-corruption}

**問題（s5）**: `review.md` の Pass 1 の後ろに、AI のツールコールブロック
（`write` 呼び出しの擬似タグ列）がそのまま書き込まれ、**review 本文が二重に埋め込まれた**
状態だった。valid な監査ログになっていなかった。

**原因**: スキルが review.md を書く際に、エージェントの tool-call 出力が本文に混入する事故が
検出されない。`/ori-doctor` 等に review.md の健全性チェックが無い。

**対策**: s5 `4124af1` で破損を除去し Pass 2 に置換。

**提案**: §4 R10。

### P-J. 生成テストの型エラー（WDIO `$$().length`） {#p-j-tsc}

**問題**: s3/s4/s5 で `tsc --noEmit` がテストに型エラーを出す。
```
error TS2365: Operator '>=' cannot be applied to types 'Promise<number>' and 'number'
error TS2362: The left-hand side of an arithmetic operation must be of type ...
```
WDIO の `$$(...).length` は型上 `Promise<number>` になるため、`length` を数値として
使うと型エラー。生成テストがこの罠を踏みやすい。

**原因**: `/ori-generate` の wdio テンプレートが `$$().length` の型安全な扱いを規定して
いない。tsconfig の `skipLibCheck` では消えない。

**対策**: s3/s4 は `browser.execute` / 事前 await で回避、s5 は `count` ヘルパー
（`(await $$(sel) as unknown as {length:number}).length`）で解消。

**提案**: §4 R11。

### P-K. seed / fixture 形式の齟齬 {#p-k-seed}

**問題（s4）**: seed を `tags: ["gpt"]`（quoted）で書いたところ、app の
`parse_tags_inline` は **unquoted inline** `tags: [gpt]` を期待するため、引用符ごと tag 名
（`"gpt"`）になり no-op 判定が壊れた。

**原因**: frontmatter の正典形式（`domain` でも app 実装でも定義）を `/ori-generate` の
seed 生成が参照していない。`.md` frontmatter の tag 形式が generate 側の知識になっていない。

**対策**: s4 `6ca44be` で `tags: [gpt]`（unquoted）に修正。

**提案**: §4 R14。

### P-L. spec 実装ノートの drift {#p-l-impl-notes}

**問題**
- s3/s4: 「テストコード内で `startApp()`/`stopApp()` 相当のライフサイクル管理が必要」と
  記述（`scenario-test.instructions.md` の「lifecycle は runner config 所有」に反する）。
- s5: 「ファイル検証は `browser.executeAsync()` で `node:fs`」と記述（実際はテストプロセスの
  `node:fs`）。

**原因**: derive/generate が実装ノートに「もっともらしいが実装と異なる」手順を書き、
review も追認。spec と test の乖離が残る。

**対策**: s3/s4/s5 で spec 実装ノートを実態に是正。

**提案**: §4 R6 / R13。

## 4. ori ハーネスへの改善提案 {#proposals}

優先度: 🔴 高 / 🟡 中 / 🟢 低

> 実装状況（2026-09-12 時点）: **R1**（phase 台帳の決定的 writer `scenario-status.js`,
> `490be0a`）と **R4**（scenario の Then↔assertion coverage gate, `f60c3d4`）は ori に
> 実装済み。**R2 / R3 / R10 / R12 / R13**（doctor の scenario 整合検査・review staleness /
> 健全性検査・status schema 統一・空テスト検出）は未対応で、本レポートの s3〜s5 知見が
> 直接の根拠になる。

| # | 提案 | 対象 | 優先 |
|---|---|---|---|
| R1 | **scenario phase 台帳の決定的ライター**。phase skill / `/ori-flow` が必ず呼ぶ（`scenario-status.js set <id> <phase> closed`） | `ori-flow/scripts/`, 各 phase SKILL | 🔴 |
| R2 | **`/ori-doctor` に scenario 整合検査**。`status.yaml` の `phases`/`completion` と成果物実在の突合、`phases` 空なのに成果物がある drift 検出 | `ori-doctor/scripts/` | 🔴 |
| R3 | **review の staleness 検査**。`review.md` が `spec`/`tests`/config より古ければ警告し `/ori-flow` 再走を促す。scenario の `dirty` を実運用に乗せる | `ori-doctor`, `ori-sync` | 🔴 |
| R4 | **`Then` 句 ↔ assertion 対応を review の gate 化**。未対応を **HIGH/NEEDS_FIX** とし、カバレッジ表を review 成果物として出力（現状 LOW で通過） | `ori-review/SKILL`, `ori-reviewer` | 🔴 |
| R5 | **`spec#test-points` ↔ テストケース網羅表を生成**し欠落検出。E2E 不能項目（event 等）は代替担保の明記を必須化 | `ori-generate`, `ori-review` | 🟡 |
| R6 | **doc drift 一括是正**: validation.md の扱い決着 / `hash` schema 単一化 / 廃止済み `--force` 記述除去 / spec 実装ノートの「lifecycle をテストに書く」記述是正 | `.apm/instructions/*.md` | 🟡 |
| R7 | **scenario tsconfig の tsc gate を意味あるものに**（`tauri:options` を型宣言 or `@ts-expect-error` で吸収） | `ori-generate` wdio template | 🟡 |
| R8 | **reviewer 実行安定化**（軽量既定 + timeout fallback + 「timeout は PASS にしない」） | `ori-review/SKILL` | 🟡 |
| R9 | **ui-fields contract の traceability 検査**（ショートカット等が page spec test-points に写されているか） | `ori-doctor`, `ori-arch` adapter | 🟢 |
| R10 | **`review.md` の健全性検査**: AI tool-call 擬似タグ・重複見出し・破損の検出（`/ori-doctor`） | `ori-doctor` | 🔴 |
| R11 | **生成テストの型安全テンプレート**: `$$().length` を避ける `count` ヘルパーを wdio テンプレートに同梱 | `ori-generate` | 🟡 |
| R12 | **scenario status schema の定義と検証**: `phases` vocab（`closed`）・`beads` 有無を単一 schema 化し、`/ori-doctor` が検証 | `ori-doctor`, `ori-flow` | 🔴 |
| R13 | **空テスト/vacuously PASS の検出**: テストが対象アプリを起動・操作しているか（接続確認）、assert 数ゼロ・コメントアウトのみの検出を review gate に | `ori-review`, `ori-generate` | 🔴 |
| R14 | **seed/fixture 形式の SSoT 化**: `.md` frontmatter の正典形式（tags 等）を generate の seed が参照する | `ori-generate` | 🟡 |

## 5. consumer 側で実施した対策（commit）

branch `chore/update-ori-scenario`（promptnotes）:

| commit | 内容 |
|---|---|
| `9a917dd` | s1 `status.yaml` に 4 phase を復旧記録 |
| `4fe279b` | `Cmd/Ctrl+N` → Draft focus 実装（PageMain / DraftRegion + component test） |
| `d17cb5a` | s1 scenario test に `Ctrl+N` focus assertion 追加 + review.md Pass 2 |
| `6ce4da6` | `Block.svelte` debounce 600 → 500（domain 準拠）+ feed store sort test |
| `2fe492a` | s2 status finalize 復旧 + E2E 強化（timing / 実 S9）+ review Pass 2 + notes.md |
| `00ee57c` | s3 テスト実質化（永続化 / timing / no-op / I-PM10）+ spec/review 是正 |
| `6ca44be` | s4 空テストを実 UI 駆動に置換 + seed + spec hash + review 誤審訂正 |
| `4124af1` | s5 review.md 破損修復 + tsc 修正 + status schema 統一 + spec/notes 是正 |

検証（最終）: s1 2 passing / s2 2 passing / s3 3 passing / s4 2 passing / s5 1 passing、
frontend suite 142 passed、実 Tauri(WebKit) probe で `Cmd+N` focus を実証。

## 6. 所見（ハーネス設計への示唆）

- ori は **「生成（create）の経路」は script で決定的に押さえているが、
  「進捗（progress）」「検証の鮮度（freshness）」「review の信頼性（trust）」の経路に
  書き込み主体・検証主体がいない**。scenario はその空白が最も顕在化した。
- **GREEN は正しさの証明ではない**。`Then` を assert しない生成テスト、アプリに触れない
  空テスト、未対応を LOW で通す review の組み合わせは、未実装・数値乖離・空カバレッジを
  GREEN のまま温存する。「test-points/`Then` ↔ assertion のカバレッジ」と
  「テストが実際に対象を駆動しているか」を ori の中核 gate に据える価値が高い。
- **review.md 自体の品質**（誤審・陳腐化・破損）が未検査だった。監査ログを名乗る以上、
  その健全性と鮮度の機械チェックが必要。
- 一方で **「成果物は実在し、実行も GREEN」という事実は復旧の確かな根拠**になる。
  台帳復旧はこの根拠（実在 + PASS + 実行ログ）に紐づけて行うのが安全（推測で埋めない）。

## 7. 環境情報

- consumer: `promptnotes` (Tauri v2, SvelteKit, Rust)
- runner: wdio（`@wdio/tauri-service` v1.4.0, `driverProvider: 'external'`）
- driver: `tauri-driver`（`~/.cargo/bin`）+ `WebKitWebDriver`（webkit2gtk, Nix）
- agent: Sisyphus (OpenCode / DeepSeek v4 Pro)
- 関連レポート: `docs/reports/20260912-scenario-e2e-verification.md`（実行基盤 G1–G6）
