---
name: ori-flow
description: 1 slice / page を 7 phase で自律的に実装する。各 phase 1 回まで self-fix、それでも失敗時は人間に判断を委ねる
---

ユーザが `/ori-flow <id>` を呼んだ際、該当 slice / page の 7-phase workflow を順次実行します。

## 引数

- `id`：実装する slice / page の id（`.ori/slices/<id>/` または `.ori/pages/<id>/` に存在するもの）

## 手順

1. **前提確認**：
   - **存在チェック**：`ls .ori/slices/<id>/` でディレクトリの存在を確認（page なら `.ori/pages/<id>/`）。**存在しない場合は自動 scaffold しない**
     - 存在しない場合は glob で近い id を検索し fuzzy match 候補を表示
     - 候補が出たらユーザに「これですか？」と確認、Yes なら正しい id で再開
     - 候補なし or 完全に新規なら、新規 slice / page 作成を**ユーザに確認**してから進める
   - `.ori/slices/<id>/manifest.yaml` または `.ori/pages/<id>/manifest.yaml` が存在することを確認
   - `bd show ori-slice-<id>` で epic が存在するか確認、なければ beads issue を手動作成
2. **phase 1: derive** — `/ori-derive <id>` を起動し、spec.md をドメイン文書から合成する
3. **phase 2: plan** — `/ori-plan <id>` を起動し、下流 phase の beads issue description を埋める（plan.md は作らない）
4. **phase 3: test-red** — `/ori-test-red <id>` を起動し、failing test を tests/ に書く
5. **phase 4: impl-green** — `/ori-impl-green <id>` を起動し、テスト GREEN まで実装
6. **phase 5: refactor** — `/ori-refactor <id>` を起動
7. **phase 6: review** — `/ori-review <id>` を起動
   - これは **fresh-context spawn**（Task agent 等で別 context を起動）。`ori-review` スキルが reviewer agent を spawn する
8. **phase 7: finalize** — `/ori-finalize <id>` を起動し、dirty 解除 + 必要なら proposal 浮上

## エラー時のポリシー

- 各 phase 内で失敗時：**1 回だけ self-fix** を試みる
- それでも失敗：停止して人間に判断を委ねる
- `test-red` でテストが最初から GREEN：強制停止（仕様バグの可能性）
- `review` で指摘あり：該当 phase に戻り patch（**最大 1 回往復**）

## 注意

- subtask が必要なら beads issue description 内の `- [ ]` checklist を更新（**別 issue にしない**）
- domain 文書を変更したくなった場合は `/ori-sync --force <path>` または `/ori-propose` で proposal 生成
- **slice / page 不在時に勝手に新規作成しない**：必ずユーザ確認

## 次のアクション

`/ori-flow` 完走後（phase 7 finalize 完了）、ユーザに以下を提示：

- **次 slice / page パス**：`/ori-flow <next-id>` — 他に dirty な slice / page や未着手 slice / page があれば続行
- **proposal review パス**：`/ori-review-proposals` — phase 中に `--force` で生成された proposal を人間と共にレビュー
- **全体俯瞰パス**：`/ori-feature-status` で dirty / blocked / done を一覧
- **session 締めパス**：CLAUDE.md の Session Completion 手順（`bd dolt push` / `git push`）

途中停止した場合（self-fix 失敗 / GREEN-on-first-run 等）：

- **戻りパス**：失敗した phase 単独で再実行（`/ori-derive` / `/ori-test-red` / `/ori-impl-green` 等）
- **domain 修正パス**：`/ori-propose` で upstream 修正提案
- **human flag パス**：`bd human ori-<phase>-<id>` で人間判断待ちにする
