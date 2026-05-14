---
name: ori-finalize
description: /ori-flow phase 7。当該 feature の dirty 解除・proposal の浮上・beads 後始末を行う。/ori-sync が全体伝播するのに対し、こちらは 1 feature を締める
---

ユーザが `/ori-finalize <feature-id>` を呼ぶ、または `/ori-flow` 内部から phase 7 として起動した際に、**当該 feature の状態を整理して "1 feature を完了させる"**。`/ori-sync` が全体に変更を fan-out するのに対し、`/ori-finalize` は **1 feature の内向きの締め**。

## 引数

- `feature-id`：対象 feature の id

## 役割

- **clean-up 担当**：当該 feature の `status.yaml.dirty[]` をクリア
- **proposal 浮上係**：phase 中に `--force` で生成された proposal を一覧化しユーザに通知
- **beads クローザー**：当該 feature の phase issue を全て close。epic の進捗を更新
- **次手案内**：次の feature 候補 or proposal review を提示

## /ori-sync との違い

| | /ori-sync | /ori-finalize |
|--|----------|---------------|
| スコープ | 全体（domain → 全 feature） | 1 feature 内 |
| 方向 | fan-out（伝播） | fan-in（締め） |
| トリガー | post-write hook / 手動 | phase 7 / 手動 |
| 主作用 | dirty マーク追加 | dirty マーク解除、issue close |

両者は補完関係。**`/ori-sync` で他の feature が dirty になっていてもこのスキルは関与しない**（次の `/ori-flow` で対応）。

## 入力 / 出力

- 入力：
  - `.ori/features/<id>/status.yaml`
  - `.ori/features/<id>/review.md`（phase 6 結果）
  - `.ori/proposals/` 配下で当該 feature 由来のもの（`by: features/<id>`）
  - beads phase issues：`ori-{derive,plan,test-red,impl-green,refactor,review,finalize}-<id>`
- 出力：
  - `.ori/features/<id>/status.yaml.dirty[]` がクリアされる
  - 当該 feature の beads phase issue 全 close
  - epic issue の進捗更新（CLI が自動）
  - proposal が存在すれば一覧表示

## 手順

1. **前提確認**：
   - phase 6（review）が close されているか（`bd show ori-review-<id>`）
   - `pnpm -F <feature-pkg> test` GREEN を最終確認
2. **CLI に委譲**：
   ```bash
   ori feature run <feature-id> --phase finalize
   ```
   CLI が以下を機械的に実行：
   - `status.yaml.dirty[]` を空に
   - 当該 feature の hash を最新の派生元 hash に更新
   - 残り phase issue の close（既に close 済みのものは no-op）
3. **proposal の浮上**：
   ```bash
   ori proposals --by features/<feature-id>
   ```
   - 結果が空 → 通常終了
   - 1 件以上ある → ユーザに通知：
     ```
     この feature 由来で生成された proposal が <N> 件あります：

       - 2026-05-14-capture-auto-save-aggregates-note-aggregate.md
       - 2026-05-14-capture-auto-save-types-throttle-config.md

     /ori-review-proposals で確認してください。
     ```
4. **review.md 指摘の clean-up 確認**：
   - `review.md` の `Findings` が全て disposition 済みか確認
   - 未対応があれば停止し phase 6 へ差し戻し
5. **次手の提示**：
   - 他に dirty な feature が残っているなら一覧表示：
     ```bash
     ori feature list --dirty
     ```
   - 次の `/ori-flow <next-id>` 候補を提示
6. **完了**：
   ```bash
   bd close ori-finalize-<feature-id> --reason="feature complete; status cleared; <N> proposals surfaced"
   ```

## 注意

- **scope は 1 feature**：他の feature の dirty には触らない
- **proposal を勝手に accept しない**：人間判断のため `/ori-review-proposals` を案内
- **review 指摘の未対応で finalize しない**：sloppy finalize はバグの温床
- **CLI が決定的処理を担当**：このスキルはオーケストレーションと通知

## 次のアクション

phase 7 完了後、`/ori-flow` 全体が完了。ユーザに以下を提示：

- **次 feature パス**：`/ori-flow <next-feature-id>` — 次の dirty feature や未着手 feature
- **proposal review パス**：`/ori-review-proposals` — 浮上した proposal を人間と共にレビュー
- **idle パス**：dirty 残ゼロ・proposal ゼロなら一旦休む。`/ori-feature-status` で全体俯瞰
- **session 締めパス**：CLAUDE.md の Session Completion 手順（`bd dolt push` / `git push` 等）を実行
