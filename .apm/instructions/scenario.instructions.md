---
description: scenario 概念の定義、manifest スキーマ、4 phase フロー概要
applyTo: ".ori/scenarios/**"
---

## scenario とは {#what-is-scenario}

**scenario** は、複数サービス（フロントエンド・バックエンド・ワーカー等）の境界をまたぐ E2E 検証単位。slice / page と並ぶ ori の第一級概念。

| 概念 | 定義 | 所属 | derives_from | phase 数 |
|---|---|---|---|---|
| slice | 1 use case = 1 handler | 単一 service | workflow | 7 |
| page | UI composition unit | 単一 service | ui-fields | 7 |
| scenario | サービス横断 E2E 検証 | 複数 service | workflows + validation | 4 |

### 什么时候使うか {#when-to-use}

- フロントエンドの操作がバックエンドの複数 API を経由し、最終的に DB やイベントに反映されることを検証したい場合
- 複数マイクロサービス間の通信（HTTP / メッセージキュー / gRPC）を含むビジネスフローを検証したい場合
- docker-compose で全サービスを起動し、ブラウザ操作 + API 呼び出し + DB 状態確認を組み合わせる場合

### slice / page との違い {#difference-from-slice-page}

- **slice**: 単一サービス内の 1 ユースケース。境界契約（boundary）を経由したテストが中心
- **page**: 単一サービス内の UI 構成単位。複数 slice の UI fragment を合成
- **scenario**: 複数サービス横断。docker-compose で全サービス起動し、E2E テストを実行

## ディレクトリ構造 {#directory-structure}

```
.ori/scenarios/<scenario-id>/
  manifest.yaml          # SSoT（人間が書く）
  spec.md                # 派生（/ori-derive が生成）
  validation.md          # 派生（Gherkin 形式、/ori-derive が生成）
  tests/
    <scenario-id>.spec.ts  # 生成テストコード（/ori-generate が生成）
  docker-compose.yml     # 自動生成（/ori-generate が生成）
  status.yaml            # dirty 管理（/ori-sync が更新）
  review.md              # レビューログ（/ori-review が生成）
```

## manifest.yaml スキーマ {#manifest-schema}

scenario の manifest.yaml は以下のフィールドを持つ:

### 必須フィールド {#required-fields}

- **`scenario_id`**: kebab-case。ファイルパス・beads issue ID と連動するため **rename 禁止**
- **`type`**: `scenario` 固定
- **`derives_from`**: ドメイン文書の `path` または `path#section-id` のリスト

### オプションフィールド {#optional-fields}

- **`pages`**: 参照する page ID の配列（例: `[order-page, payment-page]`）
- **`contracts`**: サービス間契約の宣言
  - `http`: HTTP エンドポイントのリスト（例: `["POST /api/orders", "GET /api/orders/:id"]`）
  - `events`: イベント名のリスト（例: `["OrderCreated", "PaymentCompleted"]`）
  - `slices`: 参照する slice ID のリスト（例: `["create-order", "process-payment"]`）
- **`infrastructure`**: インフラ構成の宣言
  - `services`: サービス名のリスト（例: `["web", "api", "worker", "redis", "postgres"]`）

### 例 {#example}

```yaml
scenario_id: order-flow-e2e
type: scenario
derives_from:
  - domain/workflows.md#order-workflow
  - domain/validation.md#order-validation
pages:
  - order-page
  - payment-page
contracts:
  http:
    - "POST /api/orders"
    - "GET /api/orders/:id"
    - "POST /api/payments"
  events:
    - "OrderCreated"
    - "PaymentCompleted"
  slices:
    - create-order
    - process-payment
infrastructure:
  services:
    - web
    - api
    - worker
    - redis
    - postgres
```

## 作成タイミング {#creation-timing}

1. **DDD pipeline 完了**: `/ori-distill` で workflows + validation が整備される
2. **manifest 自動生成**: `/ori-sync` が scenario manifest の雛形を生成（人間が確認・修正）
3. **beads dep 設定**: 参加 slice の beads issue に `bd depends` が自動設定
4. **全 slice 完了で unblock**: 参加 slice が全て完了したら、scenario の `/ori-flow` が unblock

## 4 phase フロー {#four-phase-flow}

scenario は 4 phase で実装する。詳細は各 SKILL.md に委譲。

### 1. derive (`/ori-derive <scenario-id>`)

- **入力**: manifest.yaml + ドメイン文書（workflows + validation）
- **出力**: spec.md（自然言語 + 参照マッピング）
- **責務**: ドメイン文書から scenario の仕様を派生。矛盾があれば停止し `/ori-propose` を促す

### 2. generate (`/ori-generate <scenario-id>`)

- **入力**: manifest.yaml + spec.md + validation.md（Gherkin）
- **出力**: テストコード + docker-compose.yml
- **責務**: Gherkin シナリオからテストコードを生成、infrastructure.services から docker-compose を生成

### 3. review (`/ori-review <scenario-id>`)

- **入力**: spec.md + テストコード + docker-compose.yml
- **出力**: review.md（PASS / NEEDS_FIX / REJECT）
- **責務**: spec ↔ テストコードの整合性を review。指摘があれば該当 phase に差し戻し

### 4. finalize (`/ori-finalize <scenario-id>`)

- **入力**: review.md（verdict=PASS）
- **出力**: dirty 解除、spec hash 更新
- **責務**: review PASS を確認し、status.yaml の dirty フラグを解除

## 相互参照 {#cross-references}

- **scenario → page**: オプション、配列（`pages: [id, ...]`）
- **page → scenario**: 参照しない
- **scenario → slice**: contracts.slices で参照

## beads 連携 {#beads-integration}

- **EpicKind**: `scenario`
- **issue 名**: `ori-scenario-<scenario-id>`
- **phase issue**: derive / generate / review / finalize
- **依存**: 参加 slice の beads issue に `bd depends` 自動設定
- **dirty 伝播**: `/ori-sync` が `.ori/scenarios/` も走査、finalize で解除

## 注意 {#caveats}

- **spec.md は派生ファイル**: 直接編集には `/ori-sync --force` が必要
- **テストコードは派生ファイル**: 直接編集には `/ori-sync --force` が必要
- **docker-compose.yml は派生ファイル**: 直接編集には `/ori-sync --force` が必要
- **推測で埋めない**: `TBD` を残し、人間判断に委ねる箇所を明示
- **自動 scaffold は禁止**: scenario が存在しなくても勝手に新規作成を呼ばない（ユーザ確認必須）
