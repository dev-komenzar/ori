---
name: ori-ddd-11b-ui-grouping
description: ori 独自 Phase 11b（UI Feature Grouping）。ui-fields の依存関係から UI feature を切り出し、各 screen の depended_by を確定する
---

ユーザが `/ori-ddd-11b-ui-grouping` を呼んだ際、ori 独自の Phase 11b（UI Feature Grouping）を実行します。**distill-ddd 上流には存在しない ori オリジナル phase** です。`.ori/domain/ui-fields/screen-*.md` を読み、画面群を意味のある UI feature に束ね、各 screen の `coherence.depended_by:` に確定値を書き戻します。

## 役割

- **ファシリテーター**：画面間の包含関係・遷移・共有 VO から UI feature 候補を提案
- **挑戦者**：「この feature は 1 画面に閉じるか、複数画面にまたがるか」を問う
- **記録係**：合意した grouping を `screen-*.md` の frontmatter（`coherence.depended_by:`）に書き込む

## 入力 / 出力

- 入力：`.ori/domain/ui-fields/screen-*.md`（Phase 11a 完了後）と `workflows/index.md`
- 出力：
  - **既存ファイル更新**：各 `ui-fields/screen-N.md` の frontmatter `coherence.depended_by:` を確定
  - 新規ファイル：`.ori/domain/ui-fields/feature-groups.md` — UI feature 一覧（grouping の根拠 + open questions）

## 手順

1. **前提確認**：
   - `.ori/domain/ui-fields/screen-*.md` が 1 つ以上ある事を確認。無ければ `/ori-ddd-11a-ui-fields` を先に促す
   - 既存の `feature-groups.md` があれば内容を表示し「追記 / 上書き / 中断」を選ばせる
2. **画面と workflow の対応表を提示**：
   ```
   screen-1 (capture-auto-save) — 単独完結
   screen-2 (edit-past-note-start) — screen-3 から遷移
   screen-3 (note-list) — root
   ```
3. **AI が grouping 候補を 1-3 案提案**：
   - **方針 A: workflow 単位**（1 workflow = 1 UI feature）— 開発粒度小、テスト容易
   - **方針 B: ナビゲーション単位**（遷移グラフの強連結成分）— UX 観点の凝集度高
   - **方針 C: 役割単位**（capture / edit / list を 1 feature にまとめる）— 大きめ feature
   - 各案について「pros / cons / 適合条件」を表で示す
4. **対話で 1 案を選ぶ**：ユーザの意図（MVP の粒度・チームサイズ）を踏まえ確定
5. **各 screen の `depended_by` を決定**：
   - その screen がどの UI feature に属するか
   - 上位画面（呼び出し元）がある場合は記録
6. **書き戻し**：
   - `screen-*.md` の frontmatter `coherence.depended_by:` を更新
   - `feature-groups.md` を新規生成
7. **`ori arch sync-ui` を実行**：
   - 確定した `depended_by` から `.ori/architecture.md` の UI feature manifest を自動生成
   - マーカー（`<!-- ori:ui-layer:begin -->` ～ `<!-- ori:ui-layer:end -->`）の外側は保持される
8. **`ori lint .ori/domain/ui-fields/` を実行**して整合性検証
9. lint 失敗時は **1 回だけ** 自動修正を試み、それでも失敗ならユーザに判断を委ねる

### Phase 完了時：UI feature の一括 scaffold 提案

確定した UI feature 群を読み上げ、ユーザに確認：

```
以下の UI feature を scaffold しますか？

  - ui-capture-form    (screen-1)
  - ui-note-browser    (screen-2, screen-3)

[1] 一括で作成（ori feature new ui-<id> --type ui を順次実行）
[2] 個別に選択
[3] スキップ（後から手動で `ori feature new` を呼ぶ）
```

ユーザの選択に応じて Bash で実行：

```bash
ori feature new ui-capture-form --type ui
ori feature new ui-note-browser --type ui
```

## 出力テンプレート

### `feature-groups.md` 新規

```markdown
---
coherence:
  source: human
  last_validated: 2026-05-14
  upstream:
    - ui-fields/index.md
    - workflows/index.md
---

# UI Feature Groups {#ui-feature-groups}

## Chosen Strategy {#chosen-strategy}

方針 B（ナビゲーション単位）を採用。理由：edit と list が強い遷移依存を持ち、別 feature にすると往復のテストが煩雑になるため。

## Groups {#groups}

### ui-capture-form {#ui-capture-form}

- screens: screen-1
- 対応 workflow: capture-auto-save
- 単独完結（他画面から遷移しない）

### ui-note-browser {#ui-note-browser}

- screens: screen-2, screen-3
- 対応 workflow: edit-past-note-start, list-notes
- screen-3 → screen-2 への遷移を含む

## Open Questions {#open-questions}

- 検索画面（screen-4）は ui-note-browser に含めるか別 feature か（暫定で含める）
```

### `screen-1.md` frontmatter 更新（既存ファイルに書き戻し）

```markdown
---
coherence:
  source: human
  last_validated: 2026-05-14
  upstream:
    - types.md#capture-auto-save-input
    - workflows/capture-auto-save.md
  depended_by:
    - ui-feature: ui-capture-form
---
```

## 注意

- **これは ori 独自 phase**：distill-ddd 上流には存在しない（ori README 参照）
- **grouping は再変更可能**：後から `coherence.depended_by:` を編集して `ori sync` すれば伝播
- このスキルは workflow を回さない。実装は `/ori-flow` の責務
- workflow feature（`/ori-ddd-9-workflows` で作成）と UI feature は独立。両方を持つ場合は dep を貼る

## 次のアクション

**これが distill-ddd 系の最終 phase**。完了したら実装に進む：

- **メインパス**：`/ori-flow <first-feature-id>` — 1 feature を 7 phase で実装開始
  - 推奨：workflow feature → UI feature の順（domain ロジック先行）
- **scaffold だけ済ませて休む**：`ori feature new ui-<id> --type ui` で beads issue だけ作っておく
- **戻る**：grouping が決まらない場合、`/ori-ddd-9-workflows` で workflow 境界を見直す
- **未確定なら**：`feature-groups.md` の `open questions` に残し、次セッションで再開
