---
name: ori-feature-status
description: feature の進捗を一覧 or 個別で要約表示。status.yaml + beads issue 状態 + dirty マーク を統合した俯瞰ビュー
---

ユーザが `/ori-feature-status [feature-id]` を呼んだ際、**feature の現在地を at-a-glance で表示**します。`ori feature list` / `bd show ori-feature-<id>` / `status.yaml` の Read を統合し、見やすい形に整形。

## 役割

- **状況集約者**：複数の情報源（status.yaml / beads / git）を統合
- **優先順位提案者**：dirty で priority 高 / blocker 多い feature を上位に
- **next-action 提示者**：見た直後に「次に何を打てばよいか」が分かる出力

## 入力 / 出力

- 入力：
  - 引数なし → 全 feature 一覧
  - `feature-id` 引数 → 当該 feature の詳細
- 出力：標準出力に整形済みレポート。**ファイル生成しない**

## 表示モード

### 全体モード（引数なし）

```
📋 ori feature status (全 <N> feature)

  id                            phase            dirty   beads          last activity
  ──────────────────────────────────────────────────────────────────────────────────────
  capture-auto-save             ⬡ review         ✓       3 open         2026-05-14 13:20
  edit-past-note-start          ⬡ derive         ✓✓      5 open         2026-05-14 09:11
  ui-capture-form               ⬢ done           -       0 open         2026-05-13 21:42
  switch-edit-target            ⬡ scaffold       -       7 open         (not started)

Legend: ⬡ in progress  ⬢ done  ✗ blocked  ✓ dirty (1 mark)  ✓✓ dirty (≥2)

⚠ Recommended next action:
  - edit-past-note-start: 2 dirty marks. Re-derive via /ori-flow edit-past-note-start
  - capture-auto-save: review pending. /ori-review or continue /ori-flow
```

### 個別モード（引数あり）

```
📋 feature: capture-auto-save

Manifest:
  type:           workflow
  derives_from:
    - domain/aggregates.md#note-aggregate
    - domain/workflows/capture-auto-save.md

Status (.ori/features/capture-auto-save/status.yaml):
  phase:          review
  dirty:          1 mark
    - upstream domain/aggregates.md#note-aggregate hash mismatch
  last_derived:   2026-05-14 13:20
  last_validated: 2026-05-14 12:05

Beads (epic ori-feature-capture-auto-save):
  ori-derive-...        ✓ closed
  ori-plan-...          ✓ closed
  ori-test-red-...      ✓ closed (4 tests written)
  ori-impl-green-...    ✓ closed
  ori-refactor-...      ✓ closed
  ori-review-...        ◐ in_progress
  ori-finalize-...      ○ open

Proposals: 0 pending

Files (git diff vs main):
  src/contexts/note-capture/      18 files changed (+520 / -12)
  .ori/features/capture-auto-save/ 6 files changed

Next action:
  ✓ Complete /ori-review capture-auto-save (in progress)
  ⚠ Note: 1 dirty mark — re-derive needed before merge
```

## 手順

1. **引数判定**：
   - 引数なし → 全 feature を列挙
   - 引数あり → 個別 feature を詳細表示
2. **データ収集**（Bash + Read）：
   - `ori feature list --format=json` で feature 一覧
   - 各 feature について `.ori/features/<id>/status.yaml` を Read
   - `bd list --label=feature:<id>` で関連 issue（または epic 経由）
   - `ori proposals --by features/<id> --count`
3. **dirty マーク検出**：
   - `status.yaml.dirty[]` の件数
   - `ori coherence diff <feature-id>` で hash 不一致を確認
4. **last activity 算出**：
   - `git log -1 --format=%ai .ori/features/<id>/`
   - or beads issue の最新 updated_at
5. **next-action の決定**（heuristic）：
   - dirty があれば「再 derive」
   - phase が in_progress なら「該当 phase の継続」
   - proposal 残れば「/ori-review-proposals」
   - 全て clean なら「次の feature の `/ori-flow`」
6. **整形して出力**：絵文字 + ANSI color（端末対応時）

## 出力フォーマット

- 全体モード：1 行 1 feature の表（id / phase / dirty / beads / last activity）
- 個別モード：セクション分けの詳細ブロック

## 注意

- **read-only**：副作用なし。ファイル変更しない
- **複数情報源の不整合に注意**：`status.yaml` と beads がズレている場合は `/ori-doctor` を案内
- **大量 feature の場合**：`--limit` で上位 20 件のみ表示、`--all` で全表示
- **CI 用には `--json` を提案**：将来の dashboard 用

## 次のアクション

レポート内容に応じて以下を案内：

- **dirty feature がある場合**：影響の大きい順に `/ori-flow <id>` で再 derive
- **review pending の feature がある場合**：`/ori-review <id>` で adversarial レビュー
- **未着手 feature がある場合**：`/ori-flow <id>` で開始
- **proposal がある場合**：`/ori-review-proposals` で人間判断
- **全てクリーンな場合**：`/ori-distill` で次の DDD phase に進む、または休む
- **情報源不整合パス**：`/ori-doctor` で詳細診断
