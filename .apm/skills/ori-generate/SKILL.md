---
name: ori-generate
description: /ori-flow phase 2。scenario spec からテストコードと docker-compose.yml を生成する
---

ユーザが `/ori-generate <scenario-id>` を呼んだ、または `/ori-flow` 内部から phase 2 として起動した際に、**該当 scenario のテストコードと docker-compose.yml を生成**します。

## 引数

- `scenario-id`：対象 scenario の id（`.ori/scenarios/<id>/` が存在する事を前提）

## 役割

- **テストコード生成器**：`manifest.yaml` + `spec.md` + `validation.md` (Gherkin) からテストコードを生成
- **docker-compose 生成器**：`manifest.yaml` の `infrastructure.services` から `docker-compose.yml` を自動生成
- **記録係**：生成物は `.ori/scenarios/<id>/` に出力

## 入力 / 出力

- 入力：
  - `.ori/scenarios/<id>/manifest.yaml`（必須。`infrastructure.services` を持つ）
  - `.ori/scenarios/<id>/spec.md`（必須。scenario の仕様）
  - `.ori/scenarios/<id>/validation.md`（必須。Gherkin 形式の検証シナリオ）
- 出力：
  - `.ori/scenarios/<id>/tests/`（テストコード）
  - `.ori/scenarios/<id>/docker-compose.yml`（docker-compose 設定）

## 手順

1. **scenario 存在確認**：
   ```bash
   bash ./scripts/check-scenario-exists.sh <scenario-id>
   ```
   - exit 0: 存在 → 次のステップへ
   - exit 2: 類似候補あり → ユーザに「これですか？」と確認、Yes なら正しい id で再開
   - exit 1: 未発見 → 新規 scenario 作成を**ユーザに確認**してから進める

2. **manifest.yaml の読み込み**：`.ori/scenarios/<id>/manifest.yaml` を Read。`infrastructure.services` が空ならエラー停止し、「先に manifest に infrastructure.services を追記してください」と案内

3. **spec.md の読み込み**：`.ori/scenarios/<id>/spec.md` を Read。scenario の仕様を理解

4. **validation.md の読み込み**：`.ori/scenarios/<id>/validation.md` を Read。Gherkin 形式の検証シナリオを理解

5. **テストコードの生成**：
   - `validation.md` の Gherkin シナリオからテストコードを生成
   - テストフレームワークは `manifest.yaml` の `implementation.language` に従う
   - テストファイルは `.ori/scenarios/<id>/tests/` に出力
   - 各 Gherkin シナリオに対応するテストファイルを生成

6. **docker-compose.yml の生成**：
   - `manifest.yaml` の `infrastructure.services` から `docker-compose.yml` を生成
   - 各サービスの定義（image、ports、environment、volumes 等）を生成
   - ファイルは `.ori/scenarios/<id>/docker-compose.yml` に出力

7. **生成物の検証**：
   - テストコードが構文的に正しいか検証
   - docker-compose.yml が構文的に正しいか検証
   - 検証失敗時は **1 回だけ** 自動修正を試み、それでも失敗ならユーザに判断を委ねる

8. **beads issue 更新**：
   ```bash
   bd update ori-generate-<scenario-id> --status=closed --notes="test code and docker-compose.yml generated"
   ```

## 出力フォーマット

### テストコード

テストコードは `validation.md` の Gherkin シナリオに基づいて生成します。各シナリオは以下の構造を持ちます：

```typescript
// .ori/scenarios/<id>/tests/<scenario>.test.ts
import { describe, it, expect } from 'vitest';

describe('<scenario>', () => {
  it('<scenario step>', async () => {
    // Given
    // When
    // Then
  });
});
```

### docker-compose.yml

docker-compose.yml は `manifest.yaml` の `infrastructure.services` に基づいて生成します：

```yaml
# .ori/scenarios/<id>/docker-compose.yml
version: '3.8'

services:
  <service-name>:
    image: <image>
    ports:
      - "<host-port>:<container-port>"
    environment:
      - <key>=<value>
    volumes:
      - <host-path>:<container-path>
```

## 注意

- **自動 scaffold は禁止**：scenario が存在しなくても勝手に新規作成を呼ばない（ユーザ確認必須）
- **生成物は派生ファイル**：直接編集には `/ori-sync --force` が必要
- **推測で埋めない**：`TBD` を残し、人間判断に委ねる箇所を明示
- このスキルは spec を書かない。**phase 2 = 生成のみ**
- **SSoT 参照原則**：生成物の仕様は常に `manifest.yaml` + `spec.md` + `validation.md` を参照する

## 次のアクション

phase 2 完了後、`/ori-flow` 内部なら自動的に phase 3 へ。単独呼び出しの場合：

- **メインパス**：`/ori-review <scenario-id>` — phase 3。scenario の adversarial review
- **生成物を修正するパス**：生成物を直接編集 → `/ori-sync --force` → 再度 `/ori-generate`
- **manifest を修正するパス**：`manifest.yaml` を編集 → 再度 `/ori-generate`