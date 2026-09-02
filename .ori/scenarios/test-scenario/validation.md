# test-scenario — Validation Scenarios

## Feature: データベースCRUD操作

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

## Feature: Redis操作

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