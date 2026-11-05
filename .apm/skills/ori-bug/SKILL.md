---
name: ori-bug
description: '既存 slice のバグ報告を 4 ケース（domain / impl / spec / cross-slice）に triage し、対応する recovery flow を案内する。自動で fix は実行しない。トリガー: バグ / bug / fix / 直らない / エラー / 壊れている / 不具合 / 動かない'
---

ユーザが `/ori-bug` を呼んだ際、**バグの所在を ori graph 上のどのノードに帰属させるか**を 4 つの triage 質問で診断し、対応する recovery flow を提案します。**自動で fix は実行しない**——README のケース分類に基づいてユーザを正しい動線へ送るだけ。

## 役割

- **triage 担当**：4 つの質問でバグを 4 ケース（domain / impl / spec / cross-slice）に分類
- **動線案内人**：各ケースに対応するスキル呼び出しを提示
- **実行禁止者**：fix は他スキル / 人間の責務。このスキルは類型化と案内のみ

## バグの 4 ケース（README より）

| # | バグの所在 | 症状 | 起点 |
|---|----------|------|------|
| **1** | **ドメインモデル**が誤り | 不変条件抜け、概念の境界違い | `.ori/domain/` 編集 |
| **2** | **spec は正しいが impl が誤り**（テスト網羅漏れ） | impl が edge case で落ちる | 失敗テスト追加 |
| **3** | **spec 自体に欠陥**（domain は正しいが derive が悪い） | 派生時に取りこぼし／曲解 | `manifest.yaml` を直す or 再 derive（spec は直接編集しない） |
| **4** | **複数 slice の統合バグ** | 単体は OK だが組み合わせで破綻 | 新規 slice 作成 |

## testid 契約違反の issue（triage の前に判定）

対象が `testid-violation` label の bd issue（`/ori-generate` / `/ori-doctor --testid-sweep` が起票）の場合は、
4 つの triage 質問を使わない。既存実装の testid を契約へ移行する作業で、手順は
[`ui-test.instructions.md#testid-migration`](../../instructions/ui-test.instructions.md#testid-migration) にある。案内するのは次のとおり:

```
分類：testid 契約違反（page:<page-id>）。契約 (.ori/pages/<page-id>/testids.yaml) は正しく、実装が追従していない。

推奨動線（[ui-test.instructions.md#testid-migration](../../instructions/ui-test.instructions.md#testid-migration)）：
  1. spec.md に screen-<N>- 形式の testid 記述がある / root・動的要素が extra に無い
       → `/ori-flow <page-id>`（derive からやり直す。ケース 3 相当）
     spec.md が正しい
       → `/ori-impl-green <page-id>` → `/ori-review <page-id>`（ケース 2 相当）
  2. 置換対応表: `node scripts/testids.js migrate-map <page-id>`
  3. 契約 testid のうち実装に使用箇所が無いもの（機能欠落）は別 issue に切り出し、移行 issue を blocked-by にする
     （spec に挙動規定あり → ケース 2 / 無し → ケース 3）
  4. 実装と unit test の selector を同じ変更で契約値へ置換（動的 testid は固定 testid + data-key）
  5. 完了: `testids.js check <page-id>` と `testids.js migrate-map <page-id>` が exit 0、unit test 通過 → issue を close

ヒント：契約を実装に合わせて書き換えない。alias も登録しない。
```

## triage 質問（順番に問う）

1. **「ドメインモデルが捉え損ねている事象か？」**
   - Yes → **ケース 1（domain bug）**
   - No → 次へ
2. **「spec.md にこの動作の規定があるか？」**
   - No → **ケース 3（spec bug）**
   - Yes → 次へ
3. **「spec の規定通り impl が動かない？」**
   - Yes → **ケース 2（impl bug）**
   - No → 次へ
4. **「単一 slice の範囲を超える？」**
   - Yes → **ケース 4（cross-slice bug）**
   - No → ユーザに「症状をもう少し詳しく」と問い返す

## 手順

1. **症状ヒアリング**：
   - 何が起きるべきで、実際は何が起きたか
   - 再現手順
   - 関係する slice id（推定で OK）
2. **関連文書の参照**（必要に応じて Read）：
   - `.ori/slices/<id>/spec.md`
   - `.ori/domain/aggregates.md` の該当 section
3. **4 つの triage 質問を順に問う**：上記フロー
4. **分類結果と動線を提示**（実行はしない）
5. **ユーザが動線を実行する宣言をしたら**、対応するスキル（/ori-distill / /ori-flow / /ori-propose）へ promot を促す

## ケース別の動線（提示のみ、実行しない）

### ケース 1（domain bug）

```
分類：ドメインバグ。.ori/domain/ の編集が必要。

推奨動線：
  1. Read / Edit .ori/domain/aggregates.md  ← 不変条件を追加 / 修正
  2. `/ori-sync`                         ← dirty 化された slice を一覧表示
  3. `/ori-flow <dirty-slice-1>`        ← 影響 slice を順次再走

ヒント：複数 slice が dirty 化される可能性が高い。最も影響の大きい
slice から /ori-flow で再 derive することを推奨。
```

### ケース 2（impl bug）

```
分類：実装バグ。spec.md は正しい想定。

推奨動線：
  1. .ori/slices/<id>/tests/ に失敗テストを追加（whitespace / unicode 等）
  2. pnpm test                      ← RED 確認
  3. `/ori-impl-green <id> --reason "manual bug: <概要>"`
  4. `/ori-review <id>` (推奨)

ヒント：ドメインには触らない。テストを先に書いて修正範囲を局所化する。
```

### ケース 3（spec bug）

spec.md は派生文書なので直接編集しない（`/ori-sync --force` は廃止済）。source を直して再生成する
（[`scenario.instructions.md#caveats`](../../instructions/scenario.instructions.md#caveats) の正規更新手順と同じ）。

```
分類：spec バグ。domain は正しいが派生が悪い。spec.md は直接編集しない。

推奨動線（原因で分ける）：
  a. 取りこぼし — 必要な domain section が manifest.yaml の derives_from に無い
       1. Edit .ori/slices/<id>/manifest.yaml   ← derives_from に section を追加
       2. `/ori-sync`                          ← manifest の変更で derive が dirty になる
       3. `/ori-flow <id>`                     ← derive から再走（spec 再生成 → 下流 phase も追従）
  b. 曲解 — derives_from は正しいが、spec が domain の記述と食い違う
       1. `/ori-flow <id>`                     ← derive からやり直す
  c. 再 derive しても同じ解釈になる — domain の記述が曖昧で一意に派生できない
       → ケース 1 に昇格（domain を明確化 → `/ori-sync` → `/ori-flow <id>`）
       → domain の変更に人間の判断が要るなら `/ori-propose` → `/ori-review-proposals`

ヒント：spec だけで局所決定する経路は無い。決めたい内容は domain（または manifest）に書く。
```

### ケース 4（cross-slice bug）

```
分類：統合バグ。複数 slice にまたがる。

推奨動線：
  1. `/ori-distill phase=workflows`   ← Phase 9 に戻り欠落シナリオを追加
  2. 新規 slice を作成
  3. `/ori-flow <integration-slice-id>`

ヒント：既存 slice を編集せず、新規 slice として境界を明確にする。
「ドメインモデルにシナリオが欠けていた」とほぼ同義。
```

## 注意

- **fix を実行しない**：このスキルはルーティングのみ。実際の修正は対象スキルに渡す
- **ケース 1 ↔ ケース 3 は紙一重**：迷ったら domain を直す方向を優先（ケース 1 へ昇格）
- **scenario の RED は検証軸の出力**：scenario（検証軸）が RED を示した場合、scenario 側に実装を足さず、原因を本 triage で分類して実装軸の動線へ渡す（実装不足の slice は `/ori-flow <slice-id>`、cross-slice は case 4）。scenario と slice は 1:1 対応不要
- **アンチパターン回避**：「impl だけパッチ」「spec.md を直接編集」「review skip」は禁止（README 参照）

## 次のアクション

triage 結果に応じて以下を案内（実行はしない）：

- **ケース 1 と分類された場合**：`.ori/domain/<file>.md` の編集 → `/ori-sync` → `/ori-flow <dirty-id>`
- **ケース 2 と分類された場合**：失敗テスト追加 → `/ori-impl-green <id> --reason "bug fix"` → `/ori-review <id>`
- **ケース 3 と分類された場合**：`manifest.yaml` の `derives_from` を直して `/ori-sync` → `/ori-flow <id>`、または `/ori-flow <id>` で再 derive。domain が曖昧ならケース 1 へ昇格（人間判断が要るなら `/ori-propose`）
- **ケース 4 と分類された場合**：`/ori-ddd-9-workflows` 再走 → 新規 slice 作成 → `/ori-flow`
- **testid-violation issue の場合**：[`ui-test.instructions.md#testid-migration`](../../instructions/ui-test.instructions.md#testid-migration) の手順（`/ori-flow <page-id>` または `/ori-impl-green <page-id>` → `/ori-review <page-id>`）
- **どれにも分類できないパス**：症状情報が不足。ユーザにヒアリング継続、難しければ `bd human` で人間判断 flag
