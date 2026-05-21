# Start: TypeScript + Rust (Tauri 2)

`ddd-typescript-tauri` テンプレートで、TS フロントエンド + Rust バックエンド
の Tauri 2 デスクトップアプリに ori の slice ベース DDD scaffold を立ち
上げます。TS と Rust の **言語境界 = cross-slice 隔離境界** として物理的に
保証されるため、片側の lint 違反がもう片側に漏れません。

TS 単体プロジェクトの場合は [typescript-web.md](./typescript-web.md) を参照。

## 1. 前提

| 要件      | バージョン       | 補足                                                                 |
| --------- | ---------------- | -------------------------------------------------------------------- |
| Node      | >= 20            |                                                                      |
| pnpm      | >= 9             |                                                                      |
| Rust      | stable >= 1.77   | `rustup` 経由                                                        |
| Tauri CLI | 2.x              | `pnpm add -D @tauri-apps/cli` が `pnpm install` で入る               |
| OS deps   | platform-specific | [Tauri prerequisites](https://tauri.app/start/prerequisites/) を参照 |
| ori CLI   | >= 0.0.1         | `npm i -g @ori-ori/cli`                                              |

```bash
node --version
pnpm --version
rustc --version
ori --version
```

## 2. プロジェクト初期化

```bash
mkdir my-tauri-app && cd my-tauri-app
ori init --template ddd-typescript-tauri
pnpm install
```

生成物は **TS 側 (`src/`)** と **Rust 側 (`src-tauri/`)** が並び、`.ori/`
に両方を統治するマルチルートの architecture.md が置かれます。

## 3. 生成された構造

```
<project>/
├── .ori/architecture.md          # SSoT — 2 つの root (ts + rs) を宣言
├── src/                          # TS フロントエンド (FSD)
│   ├── lib/
│   │   ├── shared/
│   │   │   ├── ipc/              # tauri-specta-generated bindings ← 唯一の cross-root 接点
│   │   │   ├── types/
│   │   │   ├── events/
│   │   │   └── contracts/
│   │   └── tasks/                # TS 側の worked slice
│   ├── ui-entity/
│   ├── ui-feature/               # ipc/bindings 経由で Rust commands を呼ぶ
│   ├── ui-widget/
│   └── ui-page/
└── src-tauri/                    # Rust バックエンド
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/default.json
    └── src/
        ├── lib.rs                # tauri-specta builder + Tauri runtime 起動
        ├── main.rs
        └── features/             # Rust 側 slice ベース（テンプレ rename 待ち）
            ├── mod.rs
            ├── shared/           # cross-slice primitives (AppError, DomainEvent)
            └── tasks/
                ├── mod.rs        # ← Rust 側の public API
                ├── domain.rs     # 純粋ドメイン (VO / aggregate)
                ├── application.rs
                ├── infrastructure.rs
                └── commands.rs   # #[tauri::command] #[specta::specta]
```

## 4. ルール

両 root で共通:

- **cross-slice 直接 import 禁止**。コラボは `shared/` の contracts か domain events 経由
- **各 slice の公開面は 1 つだけ**: TS は `index.ts`、Rust は `mod.rs`

TS 側固有:

- UI 4 層は片方向 `ui-page → ui-widget → ui-feature → ui-entity → shared`
- ドメインを呼べるのは `ui-feature` 層のみ
- 同層内 sibling import は禁止

Rust 側固有:

- slice 内の sibling は idiomatic な `super::*` で参照、cross-slice 連携の
  ために `crate::features::shared::*` を使う（arch-adapter-rust は Rust 2018+
  の module-file convention に沿って `crate::*` / `super::*` / `self::*` を
  正しく解決します）
- tauri command は **`src-tauri/src/features/<f>/commands.rs` にのみ**置く

## 5. TS<->Rust contract: tauri-specta

`src-tauri/src/lib.rs` で `tauri_specta::Builder` に command 関数を集め、
debug build 時に `../src/lib/shared/ipc/bindings.ts` を出力します。

```bash
pnpm tauri dev     # 初回起動時に bindings.ts が再生成される
```

TS 側はこの生成物を import して Rust を呼びます:

```ts
// src/ui-feature/complete-task-remote/index.ts
import { completeTaskCmd } from "../../lib/shared/ipc/bindings.js";

const result = await completeTaskCmd({ id: someTask.id });
```

scaffold には初期スタブの `bindings.ts` が同梱されており、初回の Tauri
ビルド前でも `pnpm typecheck` が通ります。Tauri を実際に起動すると
tauri-specta が上書きするので、**手書き編集はしない**でください。

## 6. 最初の slice を派生する

```bash
/ori-distill                          # phase 1-11 (ドメイン側)
ori slice new <slice-id>              # ドメインから slice を切り出す
/ori-flow <slice-id>                  # 7-phase TDD
```

slice が TS 側のみで完結する場合は `src/lib/<slice>/` のみを増やす。
Rust 側にも反映が必要な場合は `src-tauri/src/features/<slice>/` を同じ
名前で追加 → `commands.rs` で tauri command を公開 → `lib.rs` の
`collect_commands![...]` に追記、の順です。

## 7. アーキテクチャ lint の運用

両 root で別々の adapter を回します:

```bash
# TS root → eslint
pnpm arch:export:ts           # eslint.config.ori.js を再生成
pnpm lint                     # eslint がルール違反を検出

# Rust root → arch-adapter-rust
pnpm arch:export:rs           # src-tauri/tests/arch.rs を再生成
pnpm test:rs                  # cd src-tauri && cargo test --test arch
```

ショートカット: `pnpm arch:export` が両方を順に実行します。

`eslint.config.ori.js` と `src-tauri/tests/arch.rs` はどちらも生成物で
`.gitignore` 済み。**architecture.md を編集したら必ず `arch:export` を
走らせて両 lint を再生成する** ことが運用の基本です。

## 8. テスト

```bash
pnpm test           # vitest (TS)
pnpm test:rs        # cargo test (Rust)
pnpm typecheck      # tsc --noEmit
```

scaffold に含まれる代表的なテスト:

- `src/lib/tasks/tests/task.test.ts` — TS ドメインの unit specs
- `src/__tests__/ui-flow.test.ts` — UI 4 層貫通の e2e
- `src-tauri/src/features/tasks/domain.rs` 内の `#[cfg(test)] mod tests` — Rust ドメイン specs
- `src-tauri/tests/arch.rs` — 生成物。アーキテクチャ違反検出

## 9. パッケージング

```bash
pnpm tauri build               # 各 OS のインストーラを生成
```

詳細は [Tauri 公式の Distributing ガイド](https://tauri.app/distribute/) を参照。

## 10. 既知の制約 (v0.1)

- tauri-specta の v2 RC API は変更頻度が高めです。Cargo.toml にピン留めして
  ある version はテンプレート生成時点のもの。アップグレード時には `lib.rs`
  の Builder API も確認してください。

## 関連リンク

- [`packages/templates/ddd-typescript-tauri/README.md`](../../packages/templates/ddd-typescript-tauri/README.md) — テンプレート詳細
- [`packages/arch-adapter-rust/README.md`](../../packages/arch-adapter-rust/README.md) — Rust adapter
- [Tauri 2 公式ドキュメント](https://tauri.app/)
- [tauri-specta リポジトリ](https://github.com/specta-rs/tauri-specta)
