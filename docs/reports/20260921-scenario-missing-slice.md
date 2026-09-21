# validation scenario に対応する slice が存在しないケース — S22 (storage_dir 変更 → watcher 再起動) を事例に — レポート

> consumer リポジトリ `promptnotes` で external-change 系 scenario（S16〜S21）を実装した際、
> **S22 (`storage_dir` 変更 → ファイルウォッチャー再起動) だけが対応する実装を持たず、
> 機能自体が未実装**であることが判明した。本レポートは「slice / page から漏れる」構造的な
> 原因を追跡し、**scenario の一環で実装すべきか、slice / page を修正・新規作成すべきか**という
> 論点を記録する。
>
> - 日時: 2026-09-21
> - consumer リポジトリ: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - consumer branch: `chore/update-ori-scenario` (HEAD `64f44de`)
> - ori version: unreleased (main HEAD `c955135`)
> - 対象: `.ori/domain/validation.md#s22-storage-dir-change-watcher-restart` (L510-535)
> - agent: Sisyphus (OpenCode / DeepSeek V4.1 Flash)
> - 関連レポート:
>   `20260911-scenario-fails.md` / `20260911-scenario-grouping.md` /
>   `20260912-scenario-e2e-verification.md` / `20260912-scenario-s1-s5-retrospective.md`

## 0. 前提：実装と検証は独立の 2 軸である

本レポートの分析は、ori の **実装軸と検証軸が独立している**という原則を前提とする
（`docs/design.md` §4「slice, page, scenario の関係」、
`.apm/instructions/feature-manifest.instructions.md`、
`.apm/instructions/scenario.instructions.md`）。

| 軸 | 派生元 | 派生先 | 備考 |
|---|---|---|---|
| **実装軸** | `domain/workflows/*`（slice）/ `domain/ui-fields/*`（page） | slice / page | **manifest は validation.md を参照しない**。workflow（= 実装すべき振る舞い）を語彙にする |
| **検証軸** | `domain/workflows/*` + `domain/validation.md` | scenario | scenario manifest のみが `validation.md#<scenario-id>` を**必須 anchor** として持つ（`scenario.instructions.md:92,96`） |

**両軸は独立であり、検証（scenario）と実装（slice）を対応付ける必要はない。**
検証の役割は「期待される振る舞いが満たされていないこと（RED）を独立に示す」ことであり、
その対処（実装の追加・修正）は **別のワークフロー（実装軸の `/ori-flow` / `ori-bug`）**で行われる。
harness 上 `scenario manifest` には `contracts.slices`（任意）が存在し得るが、これは
**順序制約のための任意の関連付けにすぎず、検証の成立要件ではない**
（`scenario.instructions.md:194`）。したがって本レポートは
「scenario を実装 slice に 1:1 で結びつける」方向の改善を提案しない。

**registry（台帳）も軸ごとに分かれている**。scenario の registry / coverage は
`.ori/domain/validation.md` と `.ori/scenarios/` が担う（`new-scenario.js --list-validation`、
`/ori-feature-status` の `scenario coverage (validation.md ↔ .ori/scenarios, 1:1)`）。
一方 `.ori/domain/workflows/index.md` は **実装軸の workflow registry**（15 workflow の一覧）であり、
**scenario の管轄ではない**。同ファイル内のいかなる表も scenario の coverage 台帳として扱ってはいけない。

## 1. 事象

`promptnotes` の `.ori/domain/validation.md` には scenario S1〜S22 が定義済み。このうち
S16〜S21 は各々 `.ori/scenarios/<id>/` を持ち、`/ori-flow`（4 phase）で E2E まで到達している。
ところが S22 だけは次の状態だった。

| 観点（軸） | S16〜S21 | S22 |
|---|---|---|
| **検証軸**: `.ori/scenarios/<id>/`（E2E unit） | あり | **なし**（scenario unit が存在しない） |
| **実装軸**: 対応する workflow / slice の振る舞い | あり | **`StorageDirChanged` を購読して watcher を再起動するコードが無い** |

S22 の責務は Phase 9（実装軸）で `detect-external-changes` workflow / slice に
**正しく割り当てられ、slice spec にも明記されていた**（後述 C-DEC7 / C-DEC11 / TP-WL4）。
すなわち「設計は担当を決めているのに、それを finalize する工程と、それを RED として示す
scenario unit の両方が欠けていた」というケースである。

## 2. なぜ漏れたのか（ルートコーズ分析）

### 2.1 spec レベルでは実装軸の担当が正しく割り当てられていた

S22 の振る舞いは、ドメイン文書の複数箇所で `detect-external-changes` に割り当てられている。

- `.ori/domain/workflows/detect-external-changes.md`（Trigger / Errors / Notes）
  - `- event:StorageDirChanged`（frontmatter L11）
  - `- **StorageDirChanged event 購読時**: 旧ディレクトリの監視を停止し、新ディレクトリで再開`（L37）
  - `- watcher の再起動失敗は StorageDirChanged の subscriber として infrastructure 層が retry またはユーザーに再起動を促す`（L53-54）
  - `- **watcher 再起動**: StorageDirChanged event 購読時、旧ディレクトリの watcher を停止し、新ディレクトリで新規に起動する。watcher の停止は WatcherHandle の Drop で保証。（L108-110）`
- `.ori/domain/domain-events.md#storage-dir-changed`（Subscribers）
  - `- **Infrastructure 層（ファイルウォッチャー）**: 監視対象ディレクトリを new_dir に切り替え。旧ディレクトリの監視は停止`
- `.ori/slices/detect-external-changes/spec.md`
  - `C-DEC7`（L149）: `WatcherHandle` は Drop 時に自動停止する RAII ガード。`StorageDirChanged` 時の旧 watcher 停止は drop で保証
  - `C-DEC11`（L156）: **本 slice は `StorageDirChanged` event を購読し、watcher の再起動を行う。**`StorageDirChanged` の発行は `update-settings` slice の責務
  - `TP-WL4`（L176）: `StorageDirChanged` 購読時: 旧 watcher 停止 → 新 watcher 起動の順序が保証される

つまり「どの実装が担当すべきか」の答えは実装軸で **`detect-external-changes`
（primary_bc: note-feed）** として正しく導出されている。問題はその先（finalize と検証）にある。

### 2.2 実装軸の欠落：slice が finalize されていない（直接原因 1）

`.ori/slices/detect-external-changes/` は manifest + spec を持つが、**`status.yaml` を持たない**。
全 15 slice のうちこれだけが `status.yaml` を欠く（他 14 slice は保持）。`status.yaml` 不在 =
`/ori-flow` の phase 3〜7（test-red / impl-green / refactor / review / finalize）を**通っていない**。

そのため slice spec に書かれた `C-DEC11` / `TP-WL4` が「必須・未達」としてゲートに掛からず、
実装が部分的に存在しても検出されなかった。実装軸の scaffold は
`.apm/skills/ori-ddd-9-workflows/SKILL.md`（`[3] スキップ（後から手動で slice を作成）`）と
`.apm/skills/ori-distill/SKILL.md:36`（`Phase 9 完了時: workflow ごとに新規 slice 作成を提案`）が
示す通り **提案であり、スキップ可能**である。`detect-external-changes` は scaffold されたが
finalize まで到達しなかった。

### 2.3 検証軸の欠落：S22 の scenario unit が存在しない（直接原因 2）

S16〜S21 は各々 `.ori/scenarios/sXX-*/manifest.yaml` を持ち、`derives_from` の先頭に
`domain/validation.md#sXX-...`（必須 anchor）を置いて E2E 生成経路に乗っている。S22 には
`.ori/scenarios/s22-*` が **存在しない**。加えて S11 の scenario が S22 を明示的に範囲外へ
追い出しており、どの scenario も S22 を引き取らなかった。

- `.ori/scenarios/s11-storage-dir-change/spec.md:120`:
  `**S22 (domain/validation.md#s22-storage-dir-change-watcher-restart) の範囲**であり、本 scenario では対象外`
- `.ori/scenarios/s11-storage-dir-change/notes.md:29,90`: 同旨（「S22 のウォッチャー再起動は範囲外」）

検証軸で scenario unit が無いということは、**S22 の振る舞いが満たされていないことを RED として
示す主体が存在しない**ことを意味する。これは実装軸とは独立した欠落であり、その解消は
「S22 scenario を scaffold して RED を観測可能にする」ことであって、実装 slice との対応付けではない。

### 2.4 実装コードの状態（証拠）

`.ori/slices/detect-external-changes/spec.md` が要求する `StorageDirChanged` 購読は
実装されていない。実装済みの subscriber は external file 3 イベントのみを扱い、
`StorageDirChanged` は catch-all に落ちる。

`apps/promptnotes/src-tauri/src/note_feed/slices/detect_external_changes/commands.rs`:
```rust
event_bus.subscribe(Box::new(move |event: DomainEvent| {
    match &event {
        DomainEvent::NoteFileCreatedExternally { note, .. }
        | DomainEvent::NoteFileModifiedExternally { note, .. } => { /* upsert + notes-changed */ }
        DomainEvent::NoteFileDeletedExternally { note_id, .. } => { /* remove + notes-changed */ }
        _ => {}          // ← StorageDirChanged はここで握り潰される
    }
}));
```
`detect_external_changes` ディレクトリ配下に `StorageDirChanged` の文字列は **0 件**。
`StorageDirChanged` は `user_preferences/shared/adapters/event_bus.rs` で UI 用
`settings:storage_dir_changed` を emit するだけで、**watcher 再起動の購読者はいない**。
TP-WL4 は一度も実行されていない。

### 2.5 検証軸の台帳：S22 が scenario として scaffold されていない

検証軸の台帳は `.ori/domain/validation.md`（scenario 定義）と `.ori/scenarios/`（scaffold 実体）
であり、その coverage は `new-scenario.js --list-validation` / `/ori-feature-status` が
`coverage: 21/22 scaffolded` として示す。S22 (`s22-storage-dir-change-watcher-restart`) は
**唯一 `candidate (not scaffolded)`** のまま残っており、これが検証軸の欠落である。

（注: `.ori/domain/workflows/index.md` は実装軸の workflow を管轄する registry であり、
scenario の台帳ではない。scenario の coverage 判断をこのファイルに求めない。）

### 2.6 ori ハーネス側の構造的要因

上記の個別要因の背後に、harness が本ケースを「許容してしまう」構造がある。

1. **検証軸の coverage は `validation.md ↔ scenario` の 1:1 のみ**
   `.apm/skills/ori-feature-status/SKILL.md:37` `scenario coverage (validation.md ↔ .ori/scenarios, 1:1)`、
   `packages/skills/ori-flow/src/new-scenario.ts`（`--list-validation` が
   `candidate (not scaffolded)` と `coverage: N/M` を出す）。
   これは「validation section が scenario として scaffold されたか」を示すが、
   **未 scaffold のまま放置しても gate にはならない**（S22 は candidate のまま残った）。

2. **実装軸の workflow → slice は提案であり gate ではない**
   `docs/design.md:142` `- Slice ↔ Phase 9 workflow step(完全 1:1)`、
   `docs/design.md:222`（slice ID は workflow step ID と完全一致）と理想形は明記されるが、
   scaffold はスキップ可能（前述）。また slice を scaffold しても **finalize しなければ
   spec の invariant（C-DEC11 / TP-WL4）は検証されない**（2.2）。

3. **`ori-doctor` の cross-ref 検査は前方参照のみ**
   `.apm/skills/ori-doctor/scripts/check-cross-ref.sh` は slice manifest の参照先が実在するかを
   見るのみで、docs 側から slice を逆算しない。orphan 検査（`.apm/skills/ori-doctor/SKILL.md` §6）も
   domain section の孤立を warning するだけで、**未 finalize の slice を検出しない**。

4. **scenario は impl phase を持たない（4 phase）**
   `.apm/skills/ori-flow/SKILL.md:9` `**type: scenario** → 4 phase (derive, generate, review, finalize)`、
   `docs/design.md:182`（slice/page と異なり 4-phase）。
   scenario の成果物は E2E テストコードであり、production 実装の置き場が無い。これは
   「検証と実装を分離する」設計の帰結であり、欠陥ではない。

5. **review は機能の帰属を見ない**
   scenario review は spec ↔ test の整合（`Then` ↔ assertion）を見るのみで、
   その挙動を実装する slice の有無を突合しない。このため
   「未実装でもテストが assert していなければ PASS」が成立する
   （`docs/reports/20260912-scenario-s1-s5-retrospective.md:26-27, 85-106` の P-C / P-H と同根）。

**小括（直接原因）**: 実装軸では `detect-external-changes` が唯一 finalize されず、
spec の `C-DEC11` / `TP-WL4` がゲートに掛からなかった。検証軸では S22 の scenario unit が
存在せず、未充足を RED として示す主体が無かった。**両軸は独立しており、その欠落も独立**である。
harness は検証軸の `validation ↔ scenario` の 1:1 しか検査せず、また実装軸の
「scaffold したが finalize していない slice」を検出しないため、この空白が温存された
（scenario→slice の対応付けが無いことは欠陥ではない）。

### 2.7 最大の見落とし：scenario と slice/page の実装順（ori は「実装 → 検証」を既定にしている）

上記 2.2 / 2.3 の背後に、より大きな構造問題がある。**ori は scenario と slice/page の実装順を
「slice/page を先に実装 → scenario を最後に実行」と規定しており、TDD とは逆順である。**

- `.apm/instructions/scenario.instructions.md`（§作成タイミング L146-151）:
  1. DDD pipeline 完了
  2. manifest scaffold
  3. beads dep 設定（**参加 slice の beads issue に `bd depends` を自動設定**）
  4. **全 slice 完了で unblock**（参加 slice が全て完了したら scenario の `/ori-flow` が unblock）
- `docs/design.md:216`: `- Scenario の derive phase は「参加 slice が全部 generated」を要求 → beads dep で順序強制`
- `docs/design.md:488`（scenario 文脈の verify/derive）: `参加 slice が全部 generated + workflows + validation.md 参照可能 + runner chain 解決`

つまり scenario は **実装済み slice の事後検証**として位置づけられている。一方で ori は
**slice の内側では厳密に TDD** である（`test-red` → `impl-green` → `refactor`。`docs/design.md:483-495` の位相表）。
すなわち **TDD が slice 内に閉じており、scenario（検証軸）と slice/page（実装軸）の間の順序には
適用されていない**。この「実装順」の視点の欠落が、S22 の空白を構造的に不可視にした。

- **未実装が RED として表出しない**: scenario は実装完了後にしか走らないため、実装が存在しない
  （= slice が作られていない）ケースでは scenario が scaffold されず、RED が一度も観測されない。
- **参加 slice が空だと gate が空振りする**: `contracts.slices` は任意。S22 のように参加 slice が
  明示されなければ beads dep も張られず、scenario unit すら作られない（§2.3）。
- **検証が事後になる**: GREEN が「実装の正しさ」ではなく「テストの緩さ」を映し得る
  （`20260912-scenario-s1-s5-retrospective.md` の P-C / P-H）。

TDD に照らせば **scenario（RED）→ slice/page（GREEN）** の順が自然であり、この順序原則が
ori に明文化されていないこと自体が、S22 のような「実装の空白」を生む温床だったと考えられる。

## 3. 論点：scenario の一環で実装するか、slice / page を作り直すか

### 3.1 制約：scenario は実装 unit ではない

scenario は 4 phase（derive → generate → review → finalize）で **impl-green phase を持たない**。
成果物は E2E テストコードであり、「scenario の一環で機能を実装する」は現行 harness では
**構造的に不可能**（実装の置き場が無い）。また §0 のとおり実装軸と検証軸は独立であり、
scenario から slice を生やす／結びつける経路は設計上存在しない。仮に scenario に実装を許すと、
2 軸の独立性と「scenario = サービス横断の検証単位」という責務分離が崩れる。

### 3.2 選択肢の比較

| 選択肢 | 内容 | 問題 / 利点 |
|---|---|---|
| **A. scenario 内で実装** | scenario flow に impl phase を追加 | ❌ 4 phase 設計に反する。実装軸と検証軸が混ざり、scenario の意味が変質する |
| **B. 実装軸で既存 slice を修正** | `detect-external-changes` を finalize し、C-DEC11 / TP-WL4 の subscriber を実装 | ✅ Phase 9（実装軸）が既に当該 slice に責務を割り当て済み。当該 slice を `/ori-flow` まで通せば済む。⚠ cross-BC 配線（`SettingsEvent::StorageDirChanged` → note_feed 側 watcher）の設計が別途必要 |
| **C. 実装軸で新規 slice を作成** | watcher lifecycle を独立 slice（例 `watch-storage-dir`）として切り出す | ✅ `ori-bug` case 4（統合バグ = 新規 slice）と整合。境界が明確。⚠ workflow `detect-external-changes` に手順が既に同居しているため、workflow 側も分割する必要がある |

いずれの選択肢も **「scenario を slice に対応付ける」ことを要求しない**。対処は実装軸の
別ワークフローで完結する。

### 3.3 推奨

- **原則: 検証（scenario）と実装（slice）を独立に保つ。scenario は RED を示すことに徹し、
  その対処は実装軸の別ワークフロー（`/ori-flow` または `ori-bug` case 4）で行う。**
  scenario と slice を 1:1 で結びつける機構は導入しない（`contracts.slices` を必須化しない）。
- **S22 の進め方（2 軸を独立に埋める）**:
  1. **検証軸**: `.ori/scenarios/s22-storage-dir-change-watcher-restart/` を scaffold し、
     E2E を書いて **RED を観測可能にする**（scenario は実装しない）。
  2. **実装軸（別ワークフロー）**: 責務は既に `detect-external-changes` の spec（C-DEC11）に
     あるため、当該 slice を `/ori-flow` で finalize し、`commands.rs` の subscriber `match` に
     `StorageDirChanged` アームを追加（旧 `WatcherHandle` を drop → 新 dir で `start_watcher` を再実行）。
     cross-BC 配線（`SettingsEvent::StorageDirChanged` は note_feed の `DomainEvent` とは別 bus）が
     重く detector との同居が不自然なら、(C) で lifecycle slice に分割し workflow も分割する。
  3. 検証軸の scenario が GREEN になることは実装軸の完了の**結果**であり、両者を結びつける
     メタデータは不要。

### 3.4 論点 2：scenario と slice/page の実装順（TDD との整合）

TDD の原則では、失敗するテスト（= scenario、acceptance レベル）を先に書き、それを GREEN にする
実装を後から書く。ori の 2 軸に当てはめれば **scenario（検証軸）→ slice/page（実装軸）** の順になる。
現行の逆順（§2.7）と比較する。

| 観点 | 現行: slice → scenario（実装後検証） | TDD: scenario → slice（検証が実装を駆動） |
|---|---|---|
| 未実装の可視性 | 実装が無いと scenario が scaffold されず不可視（S22 がまさにこれ） | scenario が RED で未実装を明示 |
| gate | 参加 slice 完了で unblock（実装に依存） | scenario は独立に RED を出せる |
| 検証の位置づけ | 事後検証 | 実装を駆動する契約 |
| 2 軸の関係 | 「実装 → 検証」の順序制約で結合 | 独立（RED と実装は別ワークフロー） |

**この反転は §0 の「実装と検証は独立」と矛盾しない。** TDD の順序は **時間的な発生順序**であり、
scenario と slice をデータ上対応付ける要求ではない。scenario は RED を出すだけ、実装は別ワークフローで
行う、という独立原則を保ったまま順序のみを反転できる（むしろ現行の「参加 slice 完了で unblock」こそが
両軸を不要に結合している）。

推奨:

- **ori の既定を scenario-first（RED-first / contract-first）に反転、または明示的な選択制にする。**
  少なくとも「scenario は実装完了を待たない」ことを規定し、未実装時に RED になることを正常とする。
- `scenario.instructions.md §作成タイミング` の「全 slice 完了で unblock」を見直し、
  「scenario は独立に scaffold し RED まで実行できる（実装は別ワークフロー）」へ改める。
  参加 slice の beads dep は「E2E を GREEN まで回す段階」にのみ要求する等の段階分けを行う。
- 実行基盤が無いために RED にすら到達しない場合（binary 未ビルド・runner 未整備）は別問題として
  切り分ける（`20260912-scenario-e2e-verification.md` G1-G6）。「RED を出す」と「実行できない」は区別する。

## 4. ori ハーネスへの改善提案

> `20260912-scenario-s1-s5-retrospective.md` の R1〜R14 とは別系列として S1〜S5 で採番。
> いずれも「実装と検証を独立に保つ」原則に沿う。
> 優先度: 🔴 高 / 🟡 中

| # | 提案 | 対象 | 優先 |
|---|---|---|---|
| S1 | **実装順を scenario-first に反転 / 選択制化（TDD）**（§3.4）: `scenario.instructions.md §作成タイミング` の「全 slice 完了で unblock」を見直し、scenario を実装完了に依存させず独立に scaffold して RED を出せるようにする。「RED を出す」と「実行不能」は切り分ける | `scenario.instructions.md`, `ori-flow`, `ori-doctor` | 🔴 |
| S2 | **検証軸の coverage を gate 化**: 未 scaffold の validation section（S22 candidate）を放置可能にせず、`/ori-feature-status` / `/ori-doctor` が actionable に surface。distill 完了時点で全 section について「scenario scaffold 済み or 明示的に skip 理由を記録」を要求 | `ori-feature-status`, `ori-doctor`, distill Phase 7 | 🔴 |
| S3 | **実装軸の finalize 漏れ検出**: `status.yaml` を持たない slice（= `detect-external-changes`）を `/ori-doctor` が検出し、`/ori-flow` 未走を可視化。scaffold した slice の spec invariant が未検証のまま残らないようにする | `ori-doctor` | 🔴 |
| S4 | **RED の対処動線を明記（scenario→slice を結ばない）**: 「scenario が RED を示したら、対処は実装軸の別ワークフローで行う（`ori-bug` case 4 / `/ori-flow`）。scenario に実装しない。scenario と slice を 1:1 対応させる必要もない」を `scenario.instructions.md` / `ori-flow` / `ori-bug` に明文化 | `scenario.instructions.md`, `ori-flow`, `ori-bug` | 🟡 |
| S5 | **`contracts.slices` の位置づけを明確化**: 順序制約のための任意フィールドであり、検証の成立要件でも実装の対応表でもないことを明記（対応付けを促す現状の記述があれば是正） | `scenario.instructions.md` | 🟢 |

## 5. 環境情報

- consumer: `promptnotes` (Tauri v2, SvelteKit, Rust backend)
- consumer branch: `chore/update-ori-scenario` (HEAD `64f44de`, 2026-09-21)
- ori: unreleased (main HEAD `c955135`, 2026-09-19)
- 対象: `.ori/domain/validation.md#s22-storage-dir-change-watcher-restart` (L510-535)
- scenario coverage: 21/22 scaffolded（`s22-storage-dir-change-watcher-restart` のみ candidate）
- 実装軸の責務所在: workflow `.ori/domain/workflows/detect-external-changes.md` /
  slice `.ori/slices/detect-external-changes/`（`status.yaml` 不在、spec に C-DEC11 だが実装なし）
- agent: Sisyphus (OpenCode / DeepSeek V4.1 Flash)
- 関連レポート:
  - `docs/reports/20260911-scenario-fails.md`
  - `docs/reports/20260911-scenario-grouping.md`
  - `docs/reports/20260912-scenario-e2e-verification.md`
  - `docs/reports/20260912-scenario-s1-s5-retrospective.md`
