# s1 / s2 scenario 振り返りと ori ハーネス改善フィードバック — レポート

> consumer リポジトリ `promptnotes` で scenario `s1-note-created-happy` /
> `s2-autosave-debounce` を「実行 GREEN 確認 → 乖離解消 → 台帳復旧」まで通した際に
> 判明した ori ハーネス側の構造的 gap と、その場で実施した対策を記録する。
> 実行基盤そのものの gap（plugin / binary / node_modules / storage_dir / selector / seed）は
> 別レポート `20260912-scenario-e2e-verification.md` (G1–G6) を参照。本レポートは
> **進捗台帳・review 鮮度・spec↔impl 乖離の可視性・生成テストのカバレッジ** に焦点を当てる。
>
> - 日時: 2026-09-12
> - consumer: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - ori version: unreleased (main HEAD)
> - branch: `chore/update-ori-scenario`
> - agent: Sisyphus (OpenCode / DeepSeek v4 Pro)

## 1. 概要

s1 / s2 はどちらも **E2E を実行すると GREEN** だったが、それは「正しさの証明」では
なかった。実際には以下の4系統の問題が GREEN の裏に隠れていた。

1. **phase 進捗台帳 (status.yaml) の欠落** — commit は「4 phase 完走」と主張するのに
   台帳には phase が記録されていない
2. **review.md の陳腐化** — 生成物が後から修正されても review は再実行・無効化されない
3. **spec ↔ impl 乖離がテスト未検証で不可視** — ドメインが定めた挙動が未実装でも、
   テストがその挙動を assert していないため PASS する
4. **生成テストの test-points 未カバー** — spec の検証項目の一部しかテストされていない

これらは個別の consumer 事情ではなく、**ori の scenario ライフサイクルに書き込み・
無効化・検証の担い手がいない**ことに由来するハーネス側の構造問題である。

## 2. 対象 scenario と最終状態

| scenario | 実行 | 検出した問題 | 最終状態 |
|---|---|---|---|
| s1-note-created-happy | 2 passing | status 台帳全欠落 / `Cmd+N` 未実装かつ未検証 / review LOW 未解消 | 実装 + テスト + review Pass 2 |
| s2-autosave-debounce | 2 passing | status finalize 欠落 / review 全面的に陳腐化 / debounce 500↔600 乖離 / test-points 2/6 | 実装 + テスト強化 + review Pass 2 |

## 3. 問題 / 原因 / 対策

### P-A. scenario phase 台帳 (status.yaml) の欠落 {#p-a-ledger}

**問題（何が起きたか）**

- s1: `status.yaml` が `phases: {}` / `completion: []` のまま。一方 commit `7309b45` は
  「s1-note-created-happy 全4phase完走 (derive/generate/review/finalize)」と明記。
- s2: `completion: [derive, generate, review]` / `phases` に `finalize` が無い。一方
  commit `64d12fb` は「s2 … 4phase 完走 (derive/generate/review/finalize)」と明記。
- s4 も同様に `phases: {}`（未着手ではなく記録漏れ）。
- さらに scenario 間で schema が不統一（`phases: closed` vs `completed`、`beads:` の有無）。

**なぜ生じたか（ルートコーズ）**

1. `new-scenario.js` は `status.yaml` を
   `{ beads: { epic, current_phase: null, completion: [] }, phases: {}, dirty: [] }`
   で scaffold するが、**その後の phase 更新を書き込む主体が存在しない**。
   ori の slice は各 skill が `status.yaml.phases` を更新する運用だが、scenario の
   phase skill（derive/generate/review/finalize）の SKILL.md に status 更新手順が無い。
2. 結果として phase 記録は **AI の ad-hoc 更新**に依存し、s1/s2/s4 で抜けた。
   commit メッセージ（人間/AI が書く）と台帳（機械可読）が二重管理になり drift した。
3. `/ori-doctor` の `check-slice-schema.sh` は `.ori/slices/` のみを対象にし、
   **scenario の status schema / phase 整合を検査しない**。事後検出もされない。

**対策（consumer 側）**

- s1: `9a917dd` で derive/generate/review/finalize を `completion` / `phases` に記録。
- s2: `2fe492a` で finalize を追記。
- 記録は「成果物の実在 + review verdict=PASS」を根拠に復旧（推測で埋めない）。

**ori 改善提案**: §4 R1 / R2。

### P-B. review.md の陳腐化 {#p-b-review-stale}

**問題（何が起きたか）**

- s2 の `review.md` は「テストは **skeleton**」「`storage_dir` injection **未実装**」
  「`page-main` **未完了**」「`@wdio/*` **未インストール**」「`before()/after()` fixture」
  と記述。しかし現物は seed 付き実テスト + `TAURI_TEST_STORAGE_DIR` 実装済み +
  page-main 完了 + wdio 導入済みで、**本文が実態と完全に乖離**していた。
- これは review が `964db65`（テスト/runner config の大改修 commit）より前に書かれ、
  その後一度も再実行・無効化されなかったため。
- s1 も review 内の記述（deps 未 install / binary path）が後に解消されたが更新されず。
- さらに悪いことに、陳腐化した PASS が残ることで「レビュー済み」の外観が保たれる。

**なぜ生じたか（ルートコーズ）**

1. `review.md` は「人間が読む監査ログ」と位置づけられ、**派生ファイルの変更に対する
   無効化（invalidation）機構が無い**。spec/tests/runner config を `/ori-flow` で
   再生成しても、旧 review.md はそのまま残る。
2. scenario の `status.yaml.dirty` は常に `[]` で実質未使用。`/ori-sync` の dirty 伝播も
   domain→derived の一方向のみで、**derived 内の変更（test 再生成）は dirty にならない**。
3. `/ori-doctor` の `check-dirty-integrity.sh` も slice 前提で、scenario の
   「review が test より古い」を検出しない。

**対策（consumer 側）**

- s1: `d17cb5a` で review.md に Pass 2 を追記（実態に合わせ再判定、PASS）。
- s2: `2fe492a` で Pass 1 前提の解消確認表 + Pass 2 を追記、follow-up を RESOLVED に更新。

**ori 改善提案**: §4 R2 / R3。

### P-C. spec ↔ impl 乖離がテスト未検証で不可視 {#p-c-divergence}

**問題（何が起きたか）**

- **s1 `Cmd+N`**: `domain/ui-fields/index.md#cross-screen-shortcuts` と
  `screen-1.md` の `{#screen-1-draft-body}` が「`Cmd+N` で Draft に focus」と規定。
  しかし実装の window keydown は `Cmd+Z` のみで、`Cmd+N` は page-main spec の
  test-points にも存在しなかった。scenario test は `Ctrl+N` を送った直後に
  **`click()` しており focus を assert していなかった**ため、未実装でも PASS。
- **s2 debounce**: `domain/workflows/auto-save-note.md:63` と README が **500ms**、
  実装 `Block.svelte` は **600ms**。E2E は `pause(900)` 後の状態しか見ないため、
  500 でも 600 でも PASS。
- 2件に共通する構図: **ドメインが規定した挙動が、実装にもテストにも落ちていない。
  テストがその挙動を assert しないので GREEN になり、review も spec↔test の整合しか
  見ないので PASS する。**

**なぜ生じたか（ルートコーズ）**

1. `/ori-generate` は Gherkin からテストを生成するが、**`Then` 句の各項目を
   assertion に対応付けることを強制しない**。生成 AI が happy-path の状態確認だけを
   書くと、focus 遷移・debounce 時間のような「副作用・タイミング・フォーカス」が抜ける。
2. `/ori-review` の scenario reviewer は severity を裁量的に付けられ、s1 では
   「focus transition not asserted」を **LOW（non-blocking）** と disposition した。
   `Then` 未検証が PASS を妨げない。
3. ui-fields の field contract（`Cmd+N` 等のショートカット）と page-main spec の
   test-points の対応を機械検証する仕組みが無い。
4. debounce 500ms のようなドメイン数値が、実装定数と突合されない。

**対策（consumer 側）**

- s1: `4fe279b` で `Cmd/Ctrl+N` を実装（`DraftRegion.focusDraft()` 公開 + PageMain の
  keydown）。`PageMain.svelte.test.ts` に component test。`d17cb5a` で scenario test の
  `click()` を削除し、`Ctrl+N` 後の `activeElement` が `screen-1-draft-body` 内
  (`.cm-content`) であることを assert。実 Tauri/WebKit probe でも実証。
- s2: `6ce4da6` で `autoSaveDebounceMs` を 500 に修正。
- 両者とも実装/テスト変更後に component suite + E2E を再実行して GREEN を確認。

**ori 改善提案**: §4 R3 / R4。

### P-D. 生成テストの test-points 未カバー {#p-d-coverage}

**問題（何が起きたか）**

s2 の `spec.md#test-points` は 6 項目だが、初期テストは実質 2 項目のみ。

| test-point | 初期状態 |
|---|---|
| 発火タイミング 500ms± | ❌ 未検証（`pause(900)` のみ） |
| ファイル更新 | ✅ |
| updatedAt 更新 | ✅ |
| event `NoteBodyEdited` 発行 | ❌ 未検証（後述の原理的制約） |
| NoteFeed updatedAt sort 反映 | ❌ 未検証 |
| 冪等性 (S9) | △ 「無操作で待つと不変」だけで autosave 試行を伴わない |

**なぜ生じたか（ルートコーズ）**

1. spec の `test-points` ↔ テストケースの**網羅対応を機械的に検査していない**。
2. review は「意味的乖離」のみを見るため、未カバーは LOW 扱いで通過。
3. event 検証は production 配線（後述 NoOpBus）に依存し、E2E では原理的に不可能。
   この「テスト不能」の明示・代替担保の記録が生成物に無い。

**対策（consumer 側）**

- `2fe492a` で E2E を強化:
  - test 1: `browser.waitUntil` でファイル変化を検知し `elapsed` 400–3000ms を assert
  - test 2: body を変更 → 元に戻す編集試行後に永続化されないこと（実 S9）を assert
- `6ce4da6` で store unit test（`feed.test.ts`）に applyAutoSave 後の updated_at sort
  並び替え検証を追加。
- event は `notes.md#event-verification-policy` に **NoOpBus のため E2E 不可・
  slice unit test (`auto_save_note/tests.rs`) で担保**と明記。

**ori 改善提案**: §4 R4 / R5。

### P-E. 付随する schema / ドキュメント drift {#p-e-drift}

| # | 事象 | 詳細 |
|---|---|---|
| E1 | `validation.md` 期待と不在 | `.apm/instructions/scenario.instructions.md` §directory-structure と各 SKILL は `validation.md`（Gherkin）を derive の成果物・review 入力に挙げるが、実際の scenario ディレクトリには存在せず Given/When/Then は `spec.md` に内包される |
| E2 | `spec.md` の `hash` schema 不統一 | s2 は `hash: s2-autosave-debounce`（section id そのもの = placeholder）、s5 は実 hash。どちらが正か不明 |
| E3 | `/ori-sync --force` 記述の残存 | `.apm/instructions/scenario.instructions.md` / `scenario-test.instructions.md` は「テストコード直接編集には `/ori-sync --force` が必要」と書くが、docs/AGENTS では `--force` は廃止済み。派生ファイルを正規に編集する手段が実質不明 |
| E4 | scenario 用 tsconfig の tsc gate が常に失敗 | 生成 `tsconfig.json` で `tsc --noEmit` すると `wdio.conf.ts` の `'tauri:options' does not exist in type RequestedStandaloneCapabilities` が既知で出る。skill は構文 PASS を期待するが、毎回「既知の失敗」を許容する運用になっている |

**なぜ生じたか**: 実装（skill/script）と instructions の更新タイミングがずれ、境界概念
（validation.md の有無、hash の意味、`--force` の存廃）が複数文書で矛盾したまま残った。

**ori 改善提案**: §4 R6 / R7。

### P-F. reviewer agent のタイムアウト {#p-f-reviewer-timeout}

**問題**: `/ori-review` の scenario workflow で `ori-reviewer` agent を fresh context で
spawn したところ、**30 分の inactivity timeout で応答なし・成果物なし**。fallback として
main session の objective 検証（component suite / E2E / probe）で代替した。

**なぜ生じたか**: scenario review は入力が少ない（spec + test + config）にもかかわらず
reasoning モデルの agent を起動する。小規模変更に対して重く、失敗時のフォールバック
（main-session review に降格する等）が SKILL に定義されていない。

**ori 改善提案**: §4 R8。

## 4. ori ハーネスへの改善提案 {#proposals}

優先度: 🔴 高 / 🟡 中 / 🟢 低

| # | 提案 | 対象 | 優先 |
|---|---|---|---|
| R1 | **scenario phase 台帳の決定的ライター**を用意し、phase skill / `/ori-flow` が必ず呼ぶ。例: `ori-flow/scripts/scenario-status.js set <id> <phase> closed`。`new-scenario.js` の status 更新器を再利用 | `.apm/skills/ori-flow/scripts/`, 各 phase SKILL.md | 🔴 |
| R2 | **`/ori-doctor` に scenario 整合検査を追加**。`status.yaml` の `phases`/`completion` と成果物実在の突合、`phases` が空なのに成果物がある drift の検出。`check-slice-schema.sh` の scenario 版 | `.apm/skills/ori-doctor/scripts/` | 🔴 |
| R3 | **review の無効化（staleness）検査**。`review.md` の mtime が `spec.md`/`tests/`/runner config より古ければ `/ori-doctor` が警告、`/ori-flow` 再走を促す。scenario の `dirty` を実運用に乗せる | `ori-doctor`, `ori-sync` | 🔴 |
| R4 | **`Then` 句 ↔ assertion の対応を review の gate 化**。scenario reviewer は各 `### Then` 項目をテスト assertion に対応付け、未対応を **HIGH / NEEDS_FIX** とする（現状 LOW で通過してしまう）。カバレッジ表を review 成果物として出力 | `ori-review/SKILL.md`, `ori-reviewer` agent | 🔴 |
| R5 | **`spec#test-points` ↔ テストケースの網羅対応表を生成**し、`/ori-review` で欠落を検出。E2E 不能な項目（例: event が NoOpBus）は「代替担保（unit test 等）」の明記を必須化 | `ori-generate`, `ori-review`, `scenario-test.instructions.md` | 🟡 |
| R6 | **doc drift の一括是正**: (a) `validation.md` を derive が実際に emit するか、要求を撤廃するか決着させる (b) `spec.md` の `hash` schema を単一化 (c) 廃止済み `/ori-sync --force` の記述を全 instructions から除去し、派生ファイルを正規に更新する手段を明記 | `.apm/instructions/*.md` | 🟡 |
| R7 | **scenario の tsc gate を意味あるものに**: 生成 `wdio.conf.ts` に `// @ts-expect-error`（`tauri:options`）を付ける、または scenario 用の型宣言（`tauri:options` を capabilities に追加）を同梱し、毎回の既知失敗をなくす | `ori-generate` の wdio template | 🟡 |
| R8 | **reviewer の実行安定化**: scenario review の入力量に対し reasoning agent は過剰。軽量 review の既定 + タイムアウト時の main-session fallback + 「timeout は PASS にしない」規則を SKILL に明記 | `ori-review/SKILL.md` | 🟡 |
| R9 | **ui-fields contract の traceability 検査**（将来）: `domain/ui-fields/*.md` の field contract（ショートカット含む）が page spec の test-points に写されているかを `/ori-doctor` が確認。P-C の再発防止 | `ori-doctor`, `ori-arch` adapter | 🟢 |

## 5. consumer 側で実施した対策（commit）

branch `chore/update-ori-scenario`:

| commit | 内容 |
|---|---|
| `9a917dd` | s1 `status.yaml` に 4 phase を復旧記録 |
| `4fe279b` | `Cmd/Ctrl+N` → Draft focus 実装（PageMain / DraftRegion + component test） |
| `d17cb5a` | s1 scenario test に `Ctrl+N` focus assertion 追加 + review.md Pass 2 |
| `6ce4da6` | `Block.svelte` debounce 600 → 500（domain 準拠）+ feed store sort test |
| `2fe492a` | s2 status finalize 復旧 + E2E 強化（timing / 実 S9）+ review Pass 2 + notes.md event 方針 |

検証: frontend suite 142 passed / s2 E2E 2 passing / s3 E2E 3 passing /
実 Tauri(WebKit) probe で `Cmd+N` focus を実証。

## 6. 所見（ハーネス設計への示唆）

- ori は **「生成（create）の経路」は script で決定的に押さえているが、
  「進捗（progress）と検証の鮮度（freshness）」の経路に書き込み主体がいない**。
  scenario は特にその空白が顕在化した（台帳欠落・review 陳腐化）。
- **GREEN は正しさの証明ではない**。`Then` を assert しない生成テストと、未対応を LOW で
  通す review の組み合わせは、未実装・数値乖離を GREEN のまま温存する。
  「test-points/`Then` ↔ assertion のカバレッジ」を ori の中核 gate に据える価値が高い。
- 一方で **「成果物は実在し、実行も GREEN」という事実は復旧の確かな根拠**になる。
  台帳復旧はこの根拠（実在 + PASS + 実行ログ）に紐づけて行うのが安全（推測で埋めない）。

## 7. 環境情報

- consumer: `promptnotes` (Tauri v2, SvelteKit, Rust)
- runner: wdio（`@wdio/tauri-service` v1.4.0, `driverProvider: 'external'`）
- driver: `tauri-driver`（`~/.cargo/bin`）+ `WebKitWebDriver`（webkit2gtk, Nix）
- agent: Sisyphus (OpenCode / DeepSeek v4 Pro)
- 関連レポート: `docs/reports/20260912-scenario-e2e-verification.md`（実行基盤 G1–G6）
