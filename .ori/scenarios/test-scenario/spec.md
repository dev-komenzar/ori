---
ori:
  schema:
    propagation_level: file
coherence:
  derives_from: []
---

# test-scenario — Scenario Specification

> This file is a derived document. Edit the source manifest + domain docs and re-run `/ori-flow test-scenario phase=derive`. Use `/ori-sync` if you need to edit here directly; ori will create a proposal for the upstream review.

## 概要 {#overview}

テスト用のシナリオです。データベースとRedisを使った基本的なCRUD操作を検証します。

## シナリオステップ {#scenario-steps}

1. データベースに接続する
2. テーブルを作成する
3. レコードを挿入する
4. レコードを取得する
5. レコードを更新する
6. レコードを削除する
7. Redisに接続する
8. キーを設定する
9. キーを取得する

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