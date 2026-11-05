# バグが見つかったときの動線

1 slice を 7 phase で完走した後、ヒューマンチェックでバグが発覚した場合、**バグの所在をグラフ上のどのノードに帰属させるか**で分類し、それぞれ対応する動線を取ります。

## バグの分類（triage）

| # | バグの所在 | 症状 | 起点 |
|---|----------|------|------|
| **1** | **ドメインモデル**が誤り | 不変条件が抜けていた、概念の境界が違った | `.ori/domain/` を編集 |
| **2** | **spec は正しいが impl が誤り**（テスト網羅漏れ） | impl がエッジケースで落ちる | 失敗テストを追加 |
| **3** | **spec 自体に欠陥**（domain は正しいが derive が悪い） | 派生時に取りこぼし／曲解 | `manifest.yaml` を直す or 再 derive（spec は直接編集しない） |
| **4** | **複数 slice の統合バグ** | 単体ではテスト通るが組み合わせで破綻 | 新規 slice 作成 |

判別の質問順序：

- 「ドメインモデルが捉え損ねている事象か？」→ Yes → **ケース 1**
- 「spec.md にこの動作の規定があるか？」→ No → **ケース 3**
- 「spec の規定通り impl が動かない？」→ Yes → **ケース 2**
- 「単一 slice の範囲を超える？」→ Yes → **ケース 4**

## ケース 1：ドメインバグ（最も典型）

例：`aggregates.md#note-aggregate` の不変条件「body 編集後 `updatedAt` が必ず増分」が抜けていた。

```bash
$ vim .ori/domain/aggregates.md       # 不変条件を追加
$ /ori-sync
⚠ Changed: domain/aggregates.md#note-aggregate
  Propagating to derived slices:
    - slices/capture-auto-save (spec.md is now dirty)
    - slices/edit-past-note-start (spec.md is now dirty)
✓ Reopened beads issues: ori-derive-capture-auto-save, ori-derive-edit-past-note-start

$ /ori-flow capture-auto-save         # 再 derive → test-red → impl-green → review
```

1 つのドメイン編集 → 影響する全 slice が**自動で dirty 化**。ori が manifest の `derives_from` を辿って影響範囲を計算します。

## ケース 2：実装バグ（spec は正しい）

例：spec.md には「空 Note を破棄」と書かれているが、impl が「空白だけの Note」を見逃していた。

```bash
$ vim .ori/slices/capture-auto-save/tests/empty-note.test.ts
#   失敗テストを追加（whitespace-only も isEmpty に含める）

$ pnpm test
✗ FAIL

$ /ori-flow capture-auto-save --phase impl-green \
    --reason "manual bug report: whitespace handling"
✓ AI が isEmpty() を String#trim() ベースに修正

$ /ori-flow capture-auto-save --phase review     # 推奨
```

ドメイン文書には触れず、`--phase impl-green` で**該当 phase だけピンポイント再実行**。`--reason` が beads コメントに残ります。

## ケース 3：spec バグ（domain は正しいが derive が悪い）

例：domain には「`Tag` は小文字正規化」と書かれているのに、spec.md がそれを取りこぼしていた。

spec.md は派生文書なので直接編集しません（`/ori-sync --force` は廃止済）。原因に応じて source を直し、再生成します。

**取りこぼし**（`aggregates.md#tag-vo` が manifest の `derives_from` に無かった）：

```bash
$ vim .ori/slices/ui-tag-chip/manifest.yaml   # derives_from に domain/aggregates.md#tag-vo を追加
$ /ori-sync                                   # manifest の変更で derive が dirty になる
$ /ori-flow ui-tag-chip                       # 再 derive → test-red → impl-green → review
```

**曲解**（`derives_from` は正しいが spec の書き方が domain と食い違う）：`/ori-flow ui-tag-chip` で derive からやり直します。

再 derive しても同じ解釈になるなら、domain の記述が曖昧で一意に派生できていません。**ケース 1 に昇格**して domain を明確にします（domain の変更に人間の判断が要るなら `/ori-propose` → `/ori-review-proposals`）。spec だけで局所決定する経路はありません。

## ケース 4：統合バグ（複数 slice にまたがる）

例：`capture-auto-save` と `edit-past-note-start` が個別では正しいが、組み合わせ時の自動保存タイミングが競合する。

```bash
$ /ori-distill phase=workflows
#   distill-ddd Phase 9 に戻り、欠落していたシナリオを workflows/switch-edit-target.md として追加

$ node .apm/skills/ori-flow/scripts/new-slice.js switch-edit-target
$ /ori-flow switch-edit-target
```

統合バグは「**ドメインモデルにシナリオが欠けていた**」こととほぼ同義。既存 slice を編集せず**新規 slice として切り出す**ことで境界を明確にします。

## 共通の流れ

> **バグの所在を ori graph 上のノードに対応づける → そのノードを編集する → propagation が必要な phase を自動 reopen → AI が phase を再走 → review で再検証**

人間がやるべき判断は「**どのノードにバグがあるか**」のみ。残りの dirty 計算・再 derive・実装修正・レビューは ori workflow が機械的に運びます。

## アンチパターン

| やってはいけないこと | 理由 |
|------------------|------|
| impl を直接 patch、テスト・spec は触らない | 次の derive で実装が上書きされ消える。テストが守らない |
| spec.md を直接編集 | 次の derive で上書きされ消える。domain との drift が残る。source（manifest / domain）を直して再 derive する |
| ドメインを直さず、複数 slice の spec で局所対応 | 同じバグの暗黒コピーが各所に発生。CoDD の意義を失う |
| review を skip | adversarial 視点なしで「自分の修正は正しい」と確信してしまう |
