# Start: TypeScript + Rust (Tauri 2)

`ddd-vsa-hex-typescript-tauri` テンプレートで、TS フロントエンド + Rust
バックエンドの Tauri 2 デスクトップアプリに ori の slice ベース DDD
scaffold を立ち上げます。TS と Rust の **言語境界 = cross-slice 隔離
境界** として物理的に保証されるため、片側の lint 違反がもう片側に
漏れません。

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
ori init                # .ori/ skeleton + config.yaml 生成 (silent)
/ori-arch               # pattern=ddd-vsa-hex / framework=typescript-tauri を選択
pnpm install
```

役割分担:

- `ori init` （ステップ 1） — **silent**。`.ori/` skeleton と
  `.ori/config.yaml` のみ生成。
- `/ori-arch` （ステップ 2） — pattern (`ddd-vsa-hex`) / framework
  (`typescript-tauri`) を選ぶと `ddd-vsa-hex-typescript-tauri` template が
  cwd に展開され、TS 側 (`apps/<app>/src/`) と Rust 側
  (`apps/<app>/src-tauri/`) が並び、`.ori/architecture.md` に両 root を
  統治するマルチルート定義が置かれる。

## 3. 生成された構造

```
<project>/
├── .ori/architecture.md                       # SSoT — 2 つの root (ts + rs) を宣言
└── apps/<app>/
    ├── src/                                   # TS フロントエンド
    │   ├── task-management/                   # BC = slice_root
    │   │   ├── shared/
    │   │   │   ├── ipc/                       # tauri-specta-generated bindings ← 唯一の cross-root 接点
    │   │   │   ├── types/ events/ contracts/
    │   │   └── slices/
    │   │       └── complete-task/             # TS 側の worked slice
    │   ├── ui-widget/                         # ddd-vsa-hex ui-layer (order 1)
    │   └── ui-page/                           # ddd-vsa-hex ui-layer (order 2)
    └── src-tauri/                             # Rust バックエンド
        ├── Cargo.toml
        ├── tauri.conf.json
        ├── build.rs
        ├── capabilities/default.json
        └── src/
            ├── lib.rs                         # tauri-specta builder + Tauri runtime 起動
            ├── main.rs
            └── task_management/               # Rust 側 BC mirror (underscored name)
                ├── mod.rs
                ├── shared/                    # cross-slice primitives (AppError, DomainEvent)
                └── slices/
                    └── complete_task/         # 1 slice = 1 folder
                        ├── mod.rs             # ← Rust 側の public API
                        ├── domain.rs
                        ├── application.rs
                        ├── infrastructure.rs
                        └── commands.rs        # #[tauri::command] #[specta::specta]
```

## 4. ルール

両 root で共通:

- **cross-slice 直接 import 禁止**。コラボは BC-internal `shared/` の
  contracts か domain events 経由
- **各 slice の公開面は 1 つだけ**: TS は `index.ts`、Rust は `mod.rs`

TS 側固有:

- UI 2 層は片方向 `ui-page -> ui-widget -> {shared, domain}`（design.md §6 の ddd-vsa-hex）
- UI 層は slice の `index.ts` 経由でしかドメインへ到達できない
- 同層内 sibling import は禁止

Rust 側固有:

- slice 内の sibling は idiomatic な `super::*` で参照、cross-slice 連携の
  ために `crate::task_management::shared::*` を使う（arch-adapter-rust は
  Rust 2018+ の module-file convention に沿って `crate::*` / `super::*` /
  `self::*` を正しく解決します）
- tauri command は **`<bc>/slices/<slice>/commands.rs` にのみ**置く

## 5. TS<->Rust contract: tauri-specta

`apps/<app>/src-tauri/src/lib.rs` で `tauri_specta::Builder` に command
関数を集め、debug build 時に
`../src/task-management/shared/ipc/bindings.ts` を出力します。

```bash
pnpm tauri dev     # 初回起動時に bindings.ts が再生成される
```

TS 側はこの生成物を import して Rust を呼びます:

```ts
// apps/<app>/src/ui-widget/task-list/index.ts
import { completeTaskCmd } from "../../task-management/shared/ipc/bindings.js";

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

slice が TS 側のみで完結する場合は
`apps/<app>/src/<bc>/slices/<slice-id>/` のみを増やす。Rust 側にも反映が
必要な場合は `apps/<app>/src-tauri/src/<bc>/slices/<slice_id>/` を同じ
名前で追加 → `commands.rs` で tauri command を公開 → `lib.rs` の
`collect_commands![...]` に追記、の順です。
Rust 識別子規約により `<slice_id>` の hyphen は underscore に置き換わります
（TS 側は hyphen、Rust 側は underscore）。

## 7. アーキテクチャ lint の運用

両 root で別々の adapter を回します:

```bash
# TS root → eslint
pnpm arch:export:ts           # eslint.config.ori.js を再生成
pnpm lint                     # eslint がルール違反を検出

# Rust root → arch-adapter-rust
pnpm arch:export:rs           # apps/<app>/src-tauri/tests/arch.rs を再生成
pnpm test:rs                  # cd apps/<app>/src-tauri && cargo test --test arch
```

ショートカット: `pnpm arch:export` が両方を順に実行します。

`eslint.config.ori.js` と `apps/<app>/src-tauri/tests/arch.rs` はどちらも
生成物で `.gitignore` 済み。**architecture.md を編集したら必ず
`arch:export` を走らせて両 lint を再生成する** ことが運用の基本です。

## 8. テスト

```bash
pnpm test           # vitest (TS)
pnpm test:rs        # cargo test (Rust)
pnpm typecheck      # tsc --noEmit
```

scaffold に含まれる代表的なテスト:

- `apps/<app>/src/task-management/slices/complete-task/tests/task.test.ts` — TS ドメインの unit specs
- `apps/<app>/src/__tests__/ui-flow.test.ts` — UI 2 層 + slice 貫通の e2e
- `apps/<app>/src-tauri/src/task_management/slices/complete_task/domain.rs` 内の `#[cfg(test)] mod tests` — Rust ドメイン specs
- `apps/<app>/src-tauri/tests/arch.rs` — 生成物。アーキテクチャ違反検出

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

- [`packages/templates/ddd-vsa-hex-typescript-tauri/README.md`](../../packages/templates/ddd-vsa-hex-typescript-tauri/README.md) — テンプレート詳細
- [`packages/arch-adapter-rust/README.md`](../../packages/arch-adapter-rust/README.md) — Rust adapter
- [Tauri 2 公式ドキュメント](https://tauri.app/)
- [tauri-specta リポジトリ](https://github.com/specta-rs/tauri-specta)
