---
name: ori-sync
description: ドメイン文書 / feature 文書の変更を検知し、dirty マークを伝播する
---

`ori sync` を実行して変更を検知・伝播します。AI agent が文書編集後に呼ぶか、post-write hook が自動起動します。

## 手順

1. `ori sync` を Bash で実行（オプション: `--file <path>` で対象限定、`--since <ref>` で git ref 指定）
2. 出力を読み、dirty マークされた feature を確認
3. dirty な feature ごとに：
   - 該当 phase の beads issue を reopen（CLI が自動）
   - ユーザに「これらの feature の再 derive が必要です」と通知
4. proposal が生成されていれば（`--force` 経由）`/ori-review-proposals` の起動を案内

## --force 編集時

- 派生文書（`feature-spec.instructions` 等）を直接編集する場合は `ori sync --force <path>` を使う
- CLI が `.ori/proposals/<date>-<feature>-<target>.md` を生成
- proposal 自体の編集は人間に委ねる
