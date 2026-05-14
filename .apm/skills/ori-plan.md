---
name: ori-plan
description: /ori-flow phase 2。spec.md を読み、下流 phase の beads issue description を埋める。plan.md ファイルは作らない（beads 単一情報源）
---

ユーザが `/ori-plan <feature-id>` を呼ぶ、または `/ori-flow` 内部から phase 2 として起動した際に、**spec.md の内容を下流 beads issue（test-red / impl-green / refactor / review / finalize）の description として展開**します。**plan.md は作らない**——タスク分解は beads が単一情報源。

## 引数

- `feature-id`：対象 feature の id（`.ori/features/<id>/spec.md` が存在する前提）

## 役割

- **タスク展開者**：spec の `テスト観点` / `不変条件` / `実装ノート` を読み、下流 issue ごとに具体的な作業項目を割り当てる
- **beads 編集者**：`bd update <issue> --description=... --notes=...` で issue を埋める
- **境界守護者**：spec で TBD のままの項目は phase 2 で詰めるか、人間に投げ返す

## 入力 / 出力

- 入力：
  - `.ori/features/<id>/spec.md`（phase 1 で生成）
  - 既存の下流 beads issue（`ori-test-red-<id>`、`ori-impl-green-<id>`、`ori-refactor-<id>`、`ori-review-<id>`、`ori-finalize-<id>`）
    - 存在しない場合は **scaffold を勝手にしない**。先に `ori feature run <id> --setup-issues` をユーザに促す
- 出力（**ファイル無し / beads のみ更新**）：
  - `bd update ori-test-red-<id> --description=... --notes="checklist..."`
  - `bd update ori-impl-green-<id> --description=...`
  - `bd update ori-refactor-<id> --description=...`
  - `bd update ori-review-<id> --description=...`
  - `bd update ori-finalize-<id> --description=...`

## なぜ plan.md を作らないか

- **二重管理を避ける**：beads が task の SSoT。plan.md は drift する
- **進捗が見えにくくなる**：checklist は beads description の `- [ ]` で更新するため、ファイル化すると `git diff` ノイズになる
- **タスク粒度は phase 内に閉じる**：別 issue にしない（ori-flow.md 注意事項）

## 手順

1. **前提確認**：
   - `.ori/features/<id>/spec.md` が存在し、TBD が解消されているか確認
   - 下流 beads issue が全て存在するか（`bd show ori-test-red-<id>` 等）
2. **spec.md を読み解く**：
   - `## テスト観点 {#test-perspectives}` → test-red の description
   - `## 不変条件 {#invariants}` → impl-green の checklist
   - `## 実装ノート {#impl-notes}` → impl-green / refactor の description
3. **各下流 issue を更新**（Bash）：
   - **test-red**：観点リストを `- [ ]` で description に埋める
     ```bash
     bd update ori-test-red-<id> --description="$(cat <<'EOF'
     spec.md#test-perspectives から導出した観点：

     - [ ] happy path: 通常入力 → 期待 event
     - [ ] empty body: 空白のみ → 破棄
     - [ ] non-existent: 不明 id → NoteNotFound
     - [ ] timestamp monotonic: updatedAt 増分検証
     EOF
     )"
     ```
   - **impl-green**：不変条件を保護する実装ステップを列挙
     ```bash
     bd update ori-impl-green-<id> --description="$(cat <<'EOF'
     - [ ] domain/vo/note-body.ts: smart constructor (whitespace reject)
     - [ ] domain/note.ts: editBody + updatedAt monotonic 保証
     - [ ] application/capture-auto-save.ts: pipeline composition
     - [ ] infrastructure/note-repository-memory.ts: in-memory impl for tests
     EOF
     )"
     ```
   - **refactor**：観点（重複除去・抽象化候補）を列挙。空でも良い
   - **review**：レビュー観点を列挙
     ```bash
     bd update ori-review-<id> --description="$(cat <<'EOF'
     - [ ] spec.md と impl の挙動乖離
     - [ ] 層配置（副作用が domain/ に漏れていないか）
     - [ ] テスト網羅性（unicode whitespace 等の edge case）
     - [ ] branded types の漏れ
     EOF
     )"
     ```
   - **finalize**：sync / proposal 必要性チェックを記載
4. **TBD の扱い**：spec に TBD が残っているなら：
   - 軽微（throttle 値など）→ phase 2 で人間に質問しその場で確定。spec を更新するなら `--force` 経路
   - 重大（不変条件不明など）→ 停止し `/ori-derive` への戻りを促す
5. **完了報告**：
   ```bash
   bd close ori-plan-<id> --reason="downstream issues populated: test-red/impl-green/refactor/review/finalize"
   ```

## 注意

- **plan.md ファイルは作らない**：beads description が SSoT
- **サブ issue を切らない**：description 内 `- [ ]` checklist で対応
- **TBD は積極的に詰める**：phase 2 の主目的の一つ
- **CLI 自動化との関係**：`ori feature run <id> --phase plan` が CLI 側で雛形 description を作るが、このスキルは中身を埋める

## 次のアクション

phase 2 完了後、`/ori-flow` 内部なら自動的に phase 3 へ。単独呼び出しの場合：

- **メインパス**：`/ori-test-red <feature-id>` — phase 3。failing test を tests/ に書き起こす
- **TBD 残存パス**：`/ori-derive` で spec を再派生 or `/ori-propose` で domain 修正
- **scaffold 不在パス**：`ori feature run <id> --setup-issues` で beads epic + 7 phase を作成
