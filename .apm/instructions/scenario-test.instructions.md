---
description: scenario テストコードの構造、ランナー、データ管理規約
applyTo: ".ori/scenarios/**/tests/*.{spec,test}.{ts,tsx}"
---

## テストランナー {#test-runner}

テストランナーは `.ori/architecture.md` の `scenario_test_runner` に従う。デフォルトは **Playwright**。

- **Playwright**: ブラウザ操作 + API 呼び出し + DB 状態確認を組み合わせる E2E テスト
- **Vitest**: API 呼び出し中心の統合テスト（ブラウザ操作不要な場合）

ランナーの選択は `manifest.yaml` の `implementation.language` と `architecture.md` の stack から決定。

## テスト構造 {#test-structure}

テストコードは以下の構造に従う:

```typescript
// @ori-generated scenario:<scenario-id>
import { test, expect } from '@playwright/test';

test.describe('scenario:<scenario-id>', () => {
  test('step 1 — validation#<id>', async ({ page, request }) => {
    // Given: 事前条件
    // When: 操作
    // Then: 検証
  });

  test('step 2 — validation#<id>', async ({ page, request }) => {
    // ...
  });
});
```

### 命名規則 {#naming-conventions}

- **test.describe**: `scenario:<scenario-id>`（例: `scenario:order-flow-e2e`）
- **test**: `step N — validation#<id>`（例: `step 1 — validation#order-create`）
  - `N`: シナリオステップ番号（1-based）
  - `validation#<id>`: validation.md の Gherkin シナリオ ID

### 生成コードマーカー {#generated-code-marker}

テストファイルの先頭に以下のマーカーを配置する:

```typescript
// @ori-generated scenario:<scenario-id>
```

このマーカーは `/ori-sync` が派生ファイルを識別するために使用する。直接編集する場合は `/ori-sync --force` が必要。

## 事前条件 {#preconditions}

### docker-compose で全サービス起動 {#docker-compose-startup}

テスト実行前に `docker-compose.yml` で全サービスを起動し、healthcheck 待機を行う:

```typescript
test.beforeAll(async () => {
  // docker-compose up -d
  // healthcheck 待機（各サービスの /health エンドポイント or ポート疎通）
});
```

### healthcheck 待機 {#healthcheck-wait}

各サービスの起動を確認する方法:

- **HTTP サービス**: `GET /health` が 200 を返すまで待機
- **DB サービス**: ポート疎通 + 接続テスト
- **メッセージブローカー**: トピック作成可能か確認

## サービス横断検証 {#cross-service-verification}

scenario テストは以下の組み合わせで検証する:

### ブラウザ操作 {#browser-operations}

- Playwright の `page` オブジェクトを使用
- フォーム入力、ボタンクリック、ページ遷移
- UI の状態確認（テキスト、要素の存在）

### API 呼び出し {#api-calls}

- Playwright の `request` オブジェクトを使用
- REST API の呼び出し（GET / POST / PUT / DELETE）
- レスポンスの検証（ステータスコード、ボディ）

### DB 状態確認 {#db-state-verification}

- 直接 DB 接続して状態を確認
- テスト後のデータ整合性検証
- 注意: テストごとに独立データを使用（後述）

### イベント検証 {#event-verification}

- メッセージキュー（Redis / RabbitMQ 等）からのイベント受信確認
- イベントの内容検証
- タイムアウト設定（イベント到着待機）

## データ管理 {#data-management}

### テストごと独立データ {#test-isolated-data}

各テストは独立したデータを使用する。テスト間でデータを共有しない:

```typescript
test('step 1 — validation#order-create', async ({ request }) => {
  // テスト固有のデータを生成
  const orderId = `order-${Date.now()}`;
  
  // テスト実行
  const response = await request.post('/api/orders', {
    data: { id: orderId, /* ... */ }
  });
  
  // 検証
  expect(response.status()).toBe(201);
});
```

### 後始末 {#cleanup}

テスト後にデータをクリーンアップする:

```typescript
test.afterEach(async () => {
  // テストデータの削除
  // DB のロールバック
  // キューのクリア
});
```

## 注意 {#caveats}

- **生成コードマーカー必須**: 全テストファイルに `// @ori-generated scenario:<scenario-id>` を配置
- **テスト間独立**: 各テストは独立して実行可能であること（順序依存禁止）
- **タイムアウト設定**: サービス間通信のタイムアウトを適切に設定
- **リトライ戦略**: ネットワーク不安定を考慮したリトライ設定
- **ログ出力**: テスト失敗時のデバッグ用ログを出力
