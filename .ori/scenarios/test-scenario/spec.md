---
ori:
  schema:
    propagation_level: file
coherence:
  derives_from: []
---

# test-scenario — Scenario Specification

> sample fixture: 原典 domain doc（`.ori/domain/validation.md`）なし。`derives_from` は空で、Gherkin はこの fixture 内に直接記載している。

> This file is a derived document. Edit the source manifest + domain docs and re-run `/ori-flow test-scenario phase=derive`. If upstream needs to change, create a proposal with `/ori-propose`.

## 概要 {#overview}

テスト用のシナリオです。データベースとRedisを使った基本的なCRUD操作を検証します。

## シナリオステップ {#scenario-steps}

```gherkin
Scenario: データベースに接続する
  Given データベースサーバーが起動している
  When 接続を確立する
  Then 接続が成功する

Scenario: テーブルを作成する
  Given データベースに接続している
  When テーブルを作成する
  Then テーブルが作成される

Scenario: レコードを挿入する
  Given テーブルが存在する
  When レコードを挿入する
  Then レコードが挿入される

Scenario: レコードを取得する
  Given レコードが存在する
  When レコードを取得する
  Then レコードが取得できる

Scenario: レコードを更新する
  Given レコードが存在する
  When レコードを更新する
  Then レコードが更新される

Scenario: レコードを削除する
  Given レコードが存在する
  When レコードを削除する
  Then レコードが削除される

Scenario: Redisに接続する
  Given Redisサーバーが起動している
  When 接続を確立する
  Then 接続が成功する

Scenario: キーを設定する
  Given Redisに接続している
  When キーを設定する
  Then キーが設定される

Scenario: キーを取得する
  Given キーが存在する
  When キーを取得する
  Then キーが取得できる
```

## テスト観点 {#test-points}

- データベース接続の確立
- CRUD操作の正確性
- Redis接続の確立
- キー・値の設定と取得
- エラーハンドリング

## 実装ノート {#impl-notes}

- PostgreSQL 15を使用
- Redis 7を使用
- TypeScript + Vitestでテストを実装
- docker-composeでインフラを構築