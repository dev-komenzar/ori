---
name: ori-finalize
description: /ori-flow phase 7。当該 slice の dirty 解除・proposal の浮上・beads 後始末を行う。/ori-sync が全体伝播するのに対し、こちらは 1 slice を締める。scenario では phase 4 として台帳 (status.yaml) を確定する
---

ユーザが `/ori-finalize <slice-id>` を呼ぶ、または `/ori-flow` 内部から phase 7 として起動した際に、**当該 slice の状態を整理して "1 slice を完了させる"**。`/ori-sync` が全体に変更を fan-out するのに対し、`/ori-finalize` は **1 slice の内向きの締め**。

## 引数

- `id`：対象 slice / scenario の id

## 役割

- **clean-up 担当**：当該 slice / page / scenario の `status.yaml.dirty[]` をクリア（**review PASS が前提** — `clear-dirty.js` が強制ゲート）
- **hash 検証 gate**：`spec.md` の `coherence.hash` と upstream の現在 hash を照合し、drift があれば止める。**finalize は hash を書き換えない**（derive 後の upstream 変更を隠さないため）
- **proposal 浮上係**：phase 中に生成された proposal を一覧化しユーザに通知
- **beads クローザー**：当該 slice の phase issue を全て close。epic の進捗を更新
- **次手案内**：次の slice 候補 or proposal review を提示

## /ori-sync との違い

| | /ori-sync | /ori-finalize |
|--|----------|---------------|
| スコープ | 全体（domain → 全 slice） | 1 slice 内 |
| 方向 | fan-out（伝播） | fan-in（締め） |
| トリガー | post-write hook / 手動 | phase 7 / 手動 |
| 主作用 | dirty マーク追加 | hash 検証、dirty マーク解除、issue close |

両者は補完関係。**`/ori-sync` で他の slice が dirty になっていてもこのスキルは関与しない**（次の `/ori-flow` で対応）。

## 入力 / 出力

- 入力：
  - `.ori/slices/<id>/status.yaml`
  - `.ori/slices/<id>/review.md`（phase 6 結果）
  - `.ori/proposals/` 配下で当該 slice 由来のもの（`by: slices/<id>`）
  - beads phase issues：`ori-{derive,plan,test-red,impl-green,refactor,review,finalize}-<id>`
- 出力：
  - `.ori/slices/<id>/status.yaml.dirty[]` がクリアされる
  - 当該 slice の beads phase issue 全 close
  - epic issue の進捗更新（CLI が自動）
  - proposal が存在すれば一覧表示

## 手順

1. **前提確認**：
   - phase 6（review）が close されているか（`bd show ori-review-<id>`）
   - `review.md` が存在し verdict=PASS であることを確認（`clear-dirty.js` が自動検証）
   - `pnpm -F <slice-pkg> test` GREEN を最終確認
2. **hash 検証 gate**（slice / page 共通。書き込みはしない）：
   ```bash
   bash ./scripts/check-hash-consistency.sh slices/<id>   # page なら pages/<id>
   ```
   - `/ori-doctor` と同じ検査（`check-hash-consistency.js`）を当該 1 件だけに実行する。exit code は issue 件数
   - **exit 0** → 手順 3 へ
   - **exit 1..63**（drift / file 欠落 / hash の欠落・余剰 / hash 未記録）→ **停止**。出力をユーザに提示し、`/ori-flow <id>` での再 derive を案内する（spec を upstream に追従させてから review をやり直す）。upstream の変更が spec に影響しないと**人間が**判断した drift に限り `node <ori-derive skill>/scripts/write-spec-hash.js <slice|page>/<id> --accept` を案内する（LLM は gate を通す目的で自発的に実行しない）。dirty 解除・phase issue の close には進まない
   - **exit 64** → 引数・環境の誤り（`<kind>/<id>` の指定、`.ori/` の位置を直して再実行）
   - `INFO 旧形式の coherence を検出` は issue に数えない（gate は通る）。移行は [spec hash 形式移行ガイド](https://github.com/dev-komenzar/ori/blob/main/docs/guide/spec-hash-migration.md) 参照
3. **slice / page の締め処理**：
   ```bash
   node ./scripts/clear-dirty.js <id>          # slice / page 共通。id が両方にあるときは --kind slice|page
   ```
   - `clear-dirty.js`: `.ori/{slices,pages}/<id>/review.md` の verdict=PASS を確認してから `status.yaml.dirty[]` を空にする。status.yaml は YAML ライブラリで書き戻し、書き込み前に parse し直して検証する。status.yaml が既に YAML として不正なら、該当行を示して何も書かずに exit 1 → 手で直してから再実行
   - 残り phase issue の close（既に close 済みのものは no-op）
4. **proposal の浮上**：
   ```bash
   ls .ori/proposals/ 2>/dev/null
   ```
   - 結果が空 → 通常終了
   - 1 件以上ある → ユーザに通知：
     ```
     この slice 由来で生成された proposal が <N> 件あります：

       - 2026-05-14-capture-auto-save-aggregates-note-aggregate.md
       - 2026-05-14-capture-auto-save-types-throttle-config.md

     /ori-review-proposals で確認してください。
     ```
5. **review.md 指摘の clean-up 確認**：
   - `review.md` の `Findings` が全て disposition 済みか確認
   - 未対応があれば停止し phase 6 へ差し戻し
6. **次手の提示**：
    - 他に dirty な slice が残っているなら `.ori/slices/*/status.yaml` の `dirty` 欄で一覧
    - 次の `/ori-flow <next-id>` 候補を提示
7. **完了**：
   ```bash
   bd close ori-finalize-<slice-id> --reason="slice complete; status cleared; <N> proposals surfaced"
   ```

## scenario の場合（type: scenario）

`/ori-flow` の scenario workflow は phase 4 で `/ori-finalize <scenario-id>` を呼ぶ。scenario は次の順で締める:

1. **hash 検証 gate**（slice と同じ。書き込みはしない）：
   ```bash
   bash ./scripts/check-hash-consistency.sh scenarios/<scenario-id>
   ```
   - exit 0 以外は slice の手順 2 と同じ扱い（1..63 は停止して `/ori-flow <scenario-id>` の再 derive を案内、人間判断の時だけ `node <ori-derive skill>/scripts/write-spec-hash.js scenario/<scenario-id> --accept`。64 は指定を直して再実行）。dirty 解除・台帳確定には進まない
2. **前提確認 + dirty 解除**：`clear-dirty.js` が `.ori/scenarios/<id>/review.md` の verdict=PASS を確認してから `status.yaml.dirty[]` を空にする（slice と同じ review gate）
   ```bash
   node scripts/clear-dirty.js <scenario-id>   # id が slice / page にもあるときは --kind scenario
   ```
3. **phase 台帳の確定（R1）**（決定的 writer。冪等）:
   ```bash
   node scripts/scenario-status.js set <scenario-id> finalize done
   node scripts/scenario-status.js show <scenario-id>
   ```
4. **beads close**:
   ```bash
   bd close ori-finalize-<scenario-id> --reason="scenario complete; phase ledger updated"
   ```

## 注意

- **scope は 1 slice**：他の slice の dirty には触らない
- **hash を書き換えない**：finalize は coherence の `upstream:` / `hash:` / `last_derived:` に触らない。drift は再 derive で解消し、gate を通すために spec.md の hash を手で直したり `--accept` を自発的に実行したりしない
- **review PASS 必須**：`clear-dirty.js` は `review.md` の verdict=PASS がないと dirty 解除を拒否する。バイパスするには `--skip-review-check` が必要（人間判断）
- **status.yaml を手で書き換えない**：`sed` 等の行単位置換は `dirty:` 配下のブロック列を残して YAML を壊す（壊れると `/ori-sync` が止まる）。dirty は `clear-dirty.js`、scenario の phase 台帳は `scenario-status.js` で更新する。やむを得ず `notes:` などを手で書くときは、`: ` や `#` を含む値をクォートする。壊れていないかは `/ori-doctor` の lint が status.yaml ごとに検査する
- **proposal を勝手に accept しない**：人間判断のため `/ori-review-proposals` を案内
- **review 指摘の未対応で finalize しない**：sloppy finalize はバグの温床
- **スキルが決定的処理を担当**：このスキルはオーケストレーションと通知

## 次のアクション

phase 7 完了後、`/ori-flow` 全体が完了。ユーザに以下を提示：

- **次 slice パス**：`/ori-flow <next-slice-id>` — 次の dirty slice や未着手 slice
- **proposal review パス**：`/ori-review-proposals` — 浮上した proposal を人間と共にレビュー
- **idle パス**：dirty 残ゼロ・proposal ゼロなら一旦休む。`/ori-feature-status` で全体俯瞰
- **session 締めパス**：CLAUDE.md の Session Completion 手順（`bd dolt push` / `git push` 等）を実行
