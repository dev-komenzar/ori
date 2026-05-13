---
description: 対象プロジェクトの DDD 実装規約（TypeScript）
applyTo: "src/contexts/**/*.ts"
---

## モジュール構造

- 各 Bounded Context は `src/contexts/<bc>/`：
  - `domain/`: 純粋関数のみ。VO / Aggregate / Event / Workflow
  - `application/`: ユースケース（必要に応じて）
  - `infrastructure/`: adapter、副作用（Tauri command、ファイル I/O 等）

## Value Object

- **Branded type 必須**: `type NoteId = string & { readonly __brand: 'NoteId' }`
- **Smart Constructor**: `tryNewNoteId(raw: string): Result<NoteId, NoteIdError>`
- **同値性は値で判定**：`===` で動くよう primitive ベース

## Aggregate

- Root の不変条件はコンストラクタ/メソッドで保護
- **Command メソッド**: 新 state + 発行 Events の組を返す: `{ state: Note, events: NoteEvent[] }`
- **副作用なし**：`Date.now()` やファイル I/O は引数で受け取る

## Workflow (DMMF style)

- Pipeline 関数: `loadConfig → scanVault → hydrateFeed → initSession`
- **各 stage の中間型を別々の型として定義**：コンパイラが「段階」を強制
- エラーは `Result<Ok, Err>` で表現、throw 禁止
- 副作用は pipeline 境界 (`infrastructure/`) に注入

## 型

- `any` 禁止。`unknown` を narrowing で扱う
- `Result` 型は neverthrow など外部 lib を使う（ori MVP では neverthrow を推奨）
