---
name: ori-impl-green
description: /ori-flow phase 4。failing test を GREEN にする最小実装を src/contexts/<bc>/ に書く（DDD レイアウト準拠）
---

ユーザが `/ori-impl-green <feature-id>` を呼ぶ、または `/ori-flow` 内部から phase 4 として起動した際に、**phase 3 で書いた failing test を GREEN にする最小実装を `src/contexts/<bc>/` 配下に書く**。**過剰な抽象化は phase 5（refactor）の責務**。

## 引数

- `feature-id`：対象 feature の id（`tests/` に failing test が存在する事を前提）

## 役割

- **最小実装者**：テスト 1 本ずつ通す。投機的な拡張は書かない
- **DDD レイヤー守護者**：副作用は `infrastructure/` 層にのみ置く。`domain/` と `application/` は pure
- **進捗トラッカー**：beads issue description の `- [ ]` checklist を完了ごとに `- [x]` へ更新（**サブ issue を切らない**）

## 入力 / 出力

- 入力：
  - `.ori/features/<id>/spec.md`
  - `.ori/features/<id>/tests/*.test.ts`（phase 3 で RED 確認済み）
  - `.apm/instructions/ddd-typescript.instructions`（実装規約）
- 出力：
  - `src/contexts/<bounded-context>/domain/...`
  - `src/contexts/<bounded-context>/application/...`
  - `src/contexts/<bounded-context>/infrastructure/...`（必要時）
  - `.ori/features/<id>/tests/` 配下の全テストが GREEN

## ddd-typescript.instructions 準拠ルール

| ルール | 内容 |
|--------|------|
| ディレクトリ | `src/contexts/<bc>/{domain,application,infrastructure}/` |
| Branded types | `type NoteId = string & { readonly __brand: 'NoteId' }` 形式 |
| Smart constructor | VO は `class.create(raw): Result<VO, Error>` 形式。直接 new を export しない |
| Result type | エラーは throw せず `Result<T, E>`（または `Either`）で返す |
| 副作用配置 | I/O は `infrastructure/`。`domain/` と `application/` は pure |
| 依存方向 | `infrastructure → application → domain`（逆向き禁止） |
| import | 集約をまたぐ参照は repository interface 経由のみ |

## 手順

1. **前提確認**：
   - `pnpm -F <feature-pkg> test` を Bash で実行し RED であることを確認（phase 3 完了の検証）
   - 既に GREEN なら停止し phase 3 へ差し戻す（`/ori-test-red` の "GREEN-on-first-run" と同等）
2. **テストを 1 本ずつ通す**：
   - 一番外側の `it` から順に attack
   - 「テストを通すための最小限のコード」だけ書く（YAGNI）
   - 関連する VO / entity / workflow ステップを `domain/` に追加
   - I/O が必要なら `infrastructure/` に repository 実装を追加し、`application/` で DI
3. **層配置のチェック**：
   - `domain/` に I/O 依存がないか
   - 集約をまたぐ呼び出しが repository interface 経由か
   - branded types が裸の primitive で漏れていないか
4. **進捗の記録**：beads issue description の checklist を Bash で更新：
   ```bash
   bd update ori-impl-green-<feature-id> --notes="step N done: <topic>"
   ```
   - **サブ issue は切らない**（ori-flow.md 注意事項）
5. **全テスト GREEN を確認**：
   ```bash
   pnpm -F <feature-pkg> test
   pnpm -F <feature-pkg> typecheck
   ```
6. **lint / format**：
   ```bash
   pnpm lint --fix
   pnpm format
   ```
7. **失敗時のリカバリ**：
   - 型 / lint エラー → **1 回だけ** 自動修正
   - テスト失敗が想定外 → spec を読み直す。1 回だけ patch して再実行
   - それでも失敗 → 停止して人間に判断を委ねる
8. **完了**：
   ```bash
   bd close ori-impl-green-<feature-id> --reason="all tests green; <N> files added under src/contexts/<bc>/"
   ```

## 出力テンプレート

```ts
// src/contexts/note-capture/domain/vo/note-body.ts
import { Result, ok, err } from '@ori-ori/result';

export type NoteBody = string & { readonly __brand: 'NoteBody' };

export const NoteBody = {
  create(raw: string): Result<NoteBody, 'EmptyBody'> {
    return raw.trim() === '' ? err('EmptyBody') : ok(raw as NoteBody);
  },
};
```

```ts
// src/contexts/note-capture/application/capture-auto-save.ts
import { NoteBody } from '../domain/vo/note-body';
import type { NoteRepository } from '../domain/note-repository';
import type { Clock } from '../domain/clock';
import { Result, ok, err } from '@ori-ori/result';

export type CaptureAutoSaveCommand = {
  noteId: string;
  body: string;
  occurredAt: Date;
};

export const captureAutoSave =
  (deps: { repo: NoteRepository; clock: Clock }) =>
  async (cmd: CaptureAutoSaveCommand): Promise<Result<NoteSaved, DomainError>> => {
    const body = NoteBody.create(cmd.body);
    if (body._tag === 'Left') return err('EmptyBody');
    // ...
  };
```

## 注意

- **最小実装に徹する**：refactor / abstraction は phase 5 の責務
- **副作用を domain に持ち込まない**：DB / clock / random は interface で抽象化
- **サブ issue を切らない**：checklist 更新で対応
- **テストを書かない**：phase 3 が観点を尽くしている前提。漏れたら phase 3 に戻る

## 次のアクション

phase 4 完了後、`/ori-flow` 内部なら自動的に phase 5 へ。単独呼び出しの場合：

- **メインパス**：`/ori-refactor <feature-id>` — phase 5。テストを GREEN に保ったまま重複除去・抽象化
- **観点漏れ発覚パス**：実装中に「このケースが spec に無い」と気付いた場合 → phase 3 (`/ori-test-red`) に戻し新観点を追加
- **ドメイン誤り発覚パス**：不変条件が満たせないと気付いた場合 → `/ori-propose` で domain 修正提案
