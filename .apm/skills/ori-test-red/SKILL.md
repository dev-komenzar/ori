---
name: ori-test-red
description: /ori-flow phase 3。spec.md のテスト観点から failing test を tests/ に書き起こす（RED 確認まで）
---

ユーザが `/ori-test-red <slice-id>` を呼ぶ、または `/ori-flow` 内部から phase 3 として起動した際に、**該当 slice の `tests/` 配下に failing test を書く**。**impl は書かない**。RED が観測できた時点で完了。

## 引数

- `slice-id`：対象 slice の id（`.ori/slices/<id>/spec.md` が存在する事を前提）

## 役割

- **テスト設計者**：spec.md `## テスト観点` を vitest テストに展開
- **プロパティテスター**：value object の smart constructor は fast-check で生成テスト
- **トレーサビリティ守護者**：`it` の説明は spec.md の該当セクション id を引用する
- **品質ゲート**：最初の実行で **すべて GREEN** になったら、それは spec / impl のどちらかにバグの兆候 → **強制停止**

## 入力 / 出力

- 入力：
  - `.ori/slices/<id>/spec.md`（phase 1 で生成済み）
  - `.apm/instructions/ddd-test.instructions`（テスト規約）
- 出力：
  - `.ori/slices/<id>/tests/<topic>.test.ts`（1 観点 1 ファイル基本、関連は集約可）
  - test runner: vitest
  - property test: fast-check（VO の smart constructor）

## ddd-test.instructions 準拠ルール

| ルール | 内容 |
|--------|------|
| runner | vitest |
| 命名 | `describe('slice:<slice-id>', ...)` を必ず最外殻に |
| it 引用 | `it('spec.md#<section-id>: <観点>', ...)` 形式で spec へのリンクを残す |
| VO テスト | smart constructor は fast-check の `fc.property` で網羅 |
| import | テスト対象は `../src/` から import。impl 不在でも `// @ts-expect-error` で意図的に止める |
| skip 禁止 | `it.skip` / `.todo` を使わない。書くなら失敗させる |

## 手順

1. **前提確認**：
   - `.ori/slices/<id>/spec.md` の `## テスト観点 {#test-perspectives}` を Read
   - 観点が空 / TBD のみなら停止し「先に `/ori-derive` で spec を埋めるか、ユーザに観点を確認」
2. **テスト観点を列挙**：spec.md から bullet を抽出し、各観点を 1 つの `it` に対応付ける
3. **テストファイルの構成**：
   ```
   .ori/slices/<id>/tests/
     <id>.test.ts              ← happy path + 主要観点
     <id>-vo.property.test.ts  ← VO smart constructor の fast-check（必要時）
     <id>-edge.test.ts         ← edge case を集約（任意）
   ```
4. **テストを書く**（impl は書かない）：
   - 対象 src は `../src/<id>/` を想定（後段 phase 4 が実装する場所）
   - impl 不在の段階では type error 経由で fail する。`// @ts-expect-error` は不要。失敗をそのまま観測
5. **`pnpm test --filter <slice-id>` 相当を Bash で実行**して RED を確認：
   ```bash
   pnpm -F <slice-pkg> test
   ```
6. **GREEN 観測時：強制停止**
   - 最初から全テストが GREEN なら spec か impl のどちらかにバグ可能性が高い
   - bd issue にコメントを残して human flag：
     ```bash
     bd update ori-test-red-<slice-id> --notes="test was GREEN at first run — spec gap suspected"
     bd human ori-test-red-<slice-id> --reason="GREEN-on-first-run anomaly"
     ```
   - ユーザに「spec の観点が impl 済みの動作と合致しているか確認してください」と促す
7. **RED 観測時：phase 3 完了**
   - 失敗テストの一覧を beads notes に記録：
     ```bash
     bd update ori-test-red-<slice-id> --notes="N failing tests written: ..."
     ```
   - `bd close ori-test-red-<slice-id>` で完了
8. lint / format：`pnpm lint --fix` を最後に走らせる

## 失敗時のリカバリ

- テストファイル自体に文法エラー → **1 回だけ** 自動修正
- それでも失敗 → 停止して人間に判断を委ねる

## 出力テンプレート

```ts
// .ori/slices/capture-auto-save/tests/capture-auto-save.test.ts
import { describe, it, expect } from 'vitest';
import { captureAutoSave } from '../src/capture-auto-save';

describe('slice:capture-auto-save', () => {
  it('spec.md#test-perspectives: happy path → NoteSaved event', async () => {
    const result = await captureAutoSave({
      noteId: 'note-1',
      body: 'hello',
      occurredAt: new Date('2026-05-14T00:00:00Z'),
    });
    expect(result).toMatchObject({ type: 'NoteSaved' });
  });

  it('spec.md#test-perspectives: empty body → not persisted', async () => {
    const result = await captureAutoSave({
      noteId: 'note-1',
      body: '   ',
      occurredAt: new Date('2026-05-14T00:00:00Z'),
    });
    expect(result).toMatchObject({ type: 'EmptyBody' });
  });
});
```

```ts
// .ori/slices/capture-auto-save/tests/capture-auto-save-vo.property.test.ts
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { NoteBody } from '../src/vo/note-body';

describe('slice:capture-auto-save VO', () => {
  it('spec.md#invariants: NoteBody rejects whitespace-only', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim() === ''),
        (input) => NoteBody.create(input)._tag === 'Left',
      ),
    );
  });
});
```

## 注意

- **impl を書かない**：型シグネチャを ../src/ に想像で書きたくなっても禁止。phase 4 の責務
- **観点ごとに 1 it**：1 つの it に複数 expect を詰めない
- **GREEN-on-first-run は赤信号**：spec or impl にバグの兆候。安易にテスト追加で済まさない

## 次のアクション

phase 3 完了後、`/ori-flow` 内部なら自動的に phase 4 へ。単独呼び出しの場合：

- **メインパス**：`/ori-impl-green <slice-id>` — phase 4。失敗テストを GREEN にする最小実装
- **GREEN-on-first-run で停止した場合**：
  - 観点漏れなら spec を見直し `/ori-derive` で再派生
  - impl が予期せず存在するなら `git log` で来歴を確認し、`/ori-doctor` で整合性検査
- **戻る**：spec の観点が貧弱なら `/ori-plan` で TBD を詰めるか domain に遡る
