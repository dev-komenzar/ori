---
name: ori-flow
description: 1 slice / page を 7 phase で自律的に実装する。各 phase 1 回まで self-fix、それでも失敗時は人間に判断を委ねる
---

ユーザが `/ori-flow <id>` を呼んだ際、該当 slice / page の 7-phase workflow を順次実行します。

## 引数

- `id`：実装する slice / page の id（`.ori/slices/<id>/` または `.ori/pages/<id>/` に存在するもの）

## 手順

1. **前提確認**：
   - **存在チェック**：`ori slice exists <id>` で確認（page なら `ori page exists <id>`）。**存在しない場合は自動 scaffold しない**
     - `ori slice suggest <id>` で fuzzy match による typo 候補を表示
     - 候補が出たらユーザに「これですか？」と確認、Yes なら正しい id で再開
     - 候補なし or 完全に新規なら、`ori slice new <id>` または `ori page new <id>` の実行を**ユーザに確認**してから進める
   - `.ori/slices/<id>/manifest.yaml` または `.ori/pages/<id>/manifest.yaml` が存在することを確認
   - `bd show ori-slice-<id>` で epic が存在するか確認、なければ `ori slice run <id> --setup-issues` で作成
2. **phase 1: derive** — `ori slice run <id> --phase derive` を実行。spec.md を生成
3. **phase 2: plan** — `ori slice run <id> --phase plan`。下流 phase の beads issue description を埋める
4. **phase 3: test-red** — `ori slice run <id> --phase test-red`。failing test を tests/ に書く
5. **phase 4: impl-green** — `ori slice run <id> --phase impl-green`。テスト GREEN まで実装
6. **phase 5: refactor** — `ori slice run <id> --phase refactor`
7. **phase 6: review** — `ori slice run <id> --phase review`
   - これは **fresh-context spawn**（デフォルト Opus 等 reasoning role）。CLI が `ori-reviewer` agent を起動する
8. **phase 7: sync** — `ori slice run <id> --phase sync`。dirty 解除 + 必要なら proposal

## エラー時のポリシー

- 各 phase 内で失敗時：**1 回だけ self-fix** を試みる
- それでも失敗：停止して人間に判断を委ねる
- `test-red` でテストが最初から GREEN：強制停止（仕様バグの可能性）
- `review` で指摘あり：該当 phase に戻り patch（**最大 1 回往復**）

## 注意

- subtask が必要なら beads issue description 内の `- [ ]` checklist を更新（**別 issue にしない**）
- domain 文書を変更したくなった場合は `ori sync --force <path>` で proposal 生成
- **slice / page 不在時に勝手に `ori slice new` / `ori page new` を呼ばない**：必ずユーザ確認

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
