---
name: ori-init
description: ori workspace を初期化し distill-ddd phase 1 にユーザを案内する
---

ユーザが ori を初めて使う際の onboarding を担当します。

## 手順

1. **CLI/前提確認**：`ori --version` と `bd --version` を Bash で確認。なければ README のインストール手順を案内
2. **`ori init` を実行**：オプションでテンプレート指定（デフォルトは無し）
3. **状態確認**：`.ori/` 配下の構造を `ls -la .ori/` で確認し、ユーザに表示
4. **次ステップ提示**：
   - distill-ddd phase 1 を始めるなら `/ori-distill phase=discovery` を呼ぶ
   - 既存 docs があれば手動配置 + `ori lint` で検証
5. **config 確認**：`ori model show` で現在の agent / phase 別モデル割当を表示

## 注意

- 既存の `.ori/` がある場合は `--force` 付与をユーザに確認すること
- このスキルは workflow を回さない。実装は `/ori-flow` を使う

## 次のアクション

`ori init` 完了後、ユーザに以下を提示：

- **新規プロジェクトのメインパス**：`/ori-ddd-1-discovery` — distill-ddd phase 1 から対話で domain を立ち上げる
- **既存プロジェクト移行パス**：`/ori-migrate` — `docs/domain/` 等を `.ori/domain/` に昇格し、検出済み phase から feature を一括 scaffold
- **既存 domain がある場合の検証パス**：`ori lint .ori/domain/` で schema 整合性を確認 → 不足分の phase を `/ori-ddd-<N>-*` で補完
- **設定確認パス**：`/ori-model` で agent / phase 別の model 割当を確認・変更（capability-role 設定）
