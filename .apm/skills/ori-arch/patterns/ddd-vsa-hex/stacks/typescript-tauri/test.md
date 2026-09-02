# Stack: TypeScript-Tauri — Test conventions

> pattern:ddd-vsa-hex × stack:typescript-tauri のテスト concretion 正典。
> 本 stack は **TS root (`vitest`) と Rust root (`cargo test`)** の 2 root を
> `cross_root: tauri-specta` で結ぶ。テスト規約もこの 2 root 分離を踏襲する。
>
> - stack-agnostic メタルール: `../pattern.md` "Test conventions"
> - TS 側 concretion の共通部分: `../typescript/test.md`
> - Rust 側 concretion の言語共通部分: `../rust/test.md`
> - 本ファイルは **Tauri 差分 (specta / bindings / mockIPC / production fixture)** のみを担う

## 概要

Tauri = 同一 app 内の TS/Rust 言語境界 (`cross_root`)。DoD の「boundary 経由 test」
(rule 2) は、Rust の `commands.rs`（`#[tauri::command]` 公開面）→ tauri-specta が
生成する TS 側 `shared/ipc/bindings.ts` → TS の DoD test が `commands.*` を invoke
という一方向の chain で満たす。テストの実体は TS 側 (vitest) に置き、Rust 側は
`cargo test` による内部 unit / proptest を補助とする。

## Slice DoD boundary test (`dod.test.ts`)

- **配置**: `<source_root>/<bc>/slices/<slice-id>/tests/dod.test.ts`
- **import 制約 (rule 2)**: `bindings` + `test-fixtures` + `vitest` +
  `@tauri-apps/api/mocks` のみ。`application/` / `infrastructure/` の直 import は
  DoD 違反（`/ori-doctor` が `dod-violation` label で起票）
- **production fixture (rule 3)**: `setupProductionBuilder()` を経由

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { commands } from '../../<bc>/shared/ipc/bindings';
import { clearProductionStore, setupProductionBuilder } from '../../<bc>/shared/test-fixtures';

describe('slice:<slice-id> DoD (boundary)', () => {
  beforeEach(() => mockIPC(setupProductionBuilder()));
  afterEach(() => { clearMocks(); clearProductionStore(); });
  it('spec.md#test-points: <観点> — succeeds via tauri-specta surface', async () => {
    const result = await commands.<sliceCamel>Cmd({ /* inputs per spec */ });
    expect(result).toMatchObject({ /* expected shape */ });
  });
});
```

## `setupProductionBuilder()` 規約 {#setup-production-builder}

- **配置**: `apps/<app>/src/<bc>/shared/test-fixtures/setupProductionBuilder.ts`
  （export name 固定）
- **戻り値**: tauri-specta `Builder` 相当。Rust 側 `commands.rs` の
  `#[tauri::command]` 公開関数群と一致する invoke handler を返す
- **slice 跨ぎ再利用**: 同 BC の全 slice DoD test が同一 `setupProductionBuilder()`
  を import。fake 用 `setup*Builder` を DoD test から import するのは禁止 (rule 3)

## Rust 側 boundary (commands.rs / specta / invoke_handler)

- Rust 側の DoD 必須成果物（`commands.rs` / `invoke_handler!` / specta rebuild）は
  `../rust/test.md` の "#tauri-command-surface" と
  `ddd-rust.instructions.md` の "#commands-rs-required" を参照
- Green 条件（DoD rule 2 + rule 4）を満たすには:
  1. `#[tauri::command]` + `#[specta::specta]` で export
  2. `invoke_handler!` (or `tauri_specta::Builder::commands![...]`) に配線
  3. tauri-specta generator (`cargo run --bin export-types`) で TS bindings 同期

## 参照実装

- `example-slice/ts/task-management/slices/complete-task/tests/dod.test.ts`
- `example-slice/ts/task-management/shared/test-fixtures/setupProductionBuilder.ts`
- `example-slice/rust/task_management/slices/complete_task/commands.rs`
