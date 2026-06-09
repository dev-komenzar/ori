# Start: TypeScript + Rust (Tauri 2)

`pattern:ddd-vsa-hex` × `stack:typescript-tauri` で、TS フロントエンド + Rust
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
| Tauri CLI | 2.x              | upstream init (`pnpm tauri init`) 前に `pnpm add -D @tauri-apps/cli` |
| OS deps   | platform-specific | [Tauri prerequisites](https://tauri.app/start/prerequisites/) を参照 |
| APM       | latest            | `apm install dev-komenzar/ori`                                       |

```bash
node --version
pnpm --version
rustc --version
```

## 2. プロジェクト初期化 (三段構え)

design.md §17 の「decide → upstream init → ori artifact」三段構え。

```bash
mkdir my-tauri-app && cd my-tauri-app

# ステップ 1: .ori/ skeleton + config.yaml (silent)
/ori-init

# ステップ 2: upstream framework init (ユーザが直接実行)
#   vite + Tauri を立ち上げ、TS 側 (apps/<app>/src/) と Rust 側
#   (apps/<app>/src-tauri/) の bootstrap 系を upstream で揃える
mkdir -p apps/my-tauri-app && cd apps/my-tauri-app
pnpm create vite@latest . --template vanilla-ts
pnpm add -D @tauri-apps/cli
pnpm tauri init
cd ../..

# ステップ 3: pattern / stack を決め、.ori/architecture.md (multi-root) を render
/ori-arch                                            # pattern=ddd-vsa-hex / stack=typescript-tauri を選ぶ
pnpm install
```

役割分担:

- `/ori-init` （ステップ 1） — **silent**。`.ori/` skeleton と
  `.ori/config.yaml` のみ生成。
- **upstream framework init** （ステップ 2） — `pnpm create vite@latest` +
  `pnpm tauri init` を **ユーザ自身に** 走ってもらい、TS / Rust 双方の
  bootstrap 系 (`package.json` / `tsconfig.json` / `Cargo.toml` /
  `tauri.conf.json` / `build.rs` / `capabilities/default.json` /
  `src/main.rs` 等) を upstream の最新形式で揃える。
- `/ori-arch` （ステップ 3） — pattern (`ddd-vsa-hex`) / stack
  (`typescript-tauri`) を対話で決め、内部で
  `.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript-tauri/architecture.md.tpl`
  を render → target の `.ori/architecture.md` に両 root (`ts` + `rs`) と
  cross-root 関係 (tauri-specta による bindings 生成) を 1 ファイルで宣言:

  ```bash
  node .apm/skills/ori-arch/scripts/render-architecture.js \
    --pattern ddd-vsa-hex \
    --stack typescript-tauri \
    --bc task-management
  ```

  `{{BC_NAME}}` (kebab) / `{{BC_NAME_RS}}` (snake) は kebab→snake で自動導出。

## 3. 推奨される構造

`/ori-flow new-slice <id>` で slice を作るとき、AI は
`.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript-tauri/example-slice/`
を参照して以下のような構造を生成します:

```
<project>/
├── .ori/architecture.md                       # SSoT — 2 つの root (ts + rs) を宣言
└── apps/<app>/
    ├── src/                                   # TS フロントエンド (upstream: vite vanilla-ts)
    │   ├── task-management/                   # BC = slice_root ({{BC_NAME}})
    │   │   ├── shared/
    │   │   │   ├── ipc/                       # tauri-specta-generated bindings ← 唯一の cross-root 接点
    │   │   │   ├── types/ events/ contracts/
    │   │   └── slices/
    │   │       └── <slice-id>/                # TS 側 slice
    │   ├── ui-widget/                         # ddd-vsa-hex ui-layer (order 1)
    │   └── ui-page/                           # ddd-vsa-hex ui-layer (order 2)
    └── src-tauri/                             # Rust バックエンド (upstream: tauri init)
        ├── Cargo.toml / tauri.conf.json / build.rs / capabilities/  # upstream init 産
        └── src/
            ├── main.rs / lib.rs               # upstream init 産。lib.rs に tauri-specta builder を後付け
            └── task_management/               # Rust 側 BC mirror ({{BC_NAME_RS}}, underscored)
                ├── mod.rs
                ├── shared/                    # cross-slice primitives (AppError, DomainEvent)
                └── slices/
                    └── <slice_id>/            # 1 slice = 1 folder
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
  ために `crate::task_management::shared::*` を使う（rust adapter は
  Rust 2018+ の module-file convention に沿って `crate::*` / `super::*` /
  `self::*` を正しく解決します）
- tauri command は **`<bc>/slices/<slice>/commands.rs` にのみ**置く

## 5. TS<->Rust contract: tauri-specta

upstream `tauri init` 後、`apps/<app>/src-tauri/src/lib.rs` に
`tauri_specta::Builder` を **手で組み込み**、command 関数を集めて
debug build 時に `../src/task-management/shared/ipc/bindings.ts` を
出力させます。

```bash
pnpm tauri dev     # tauri-specta が bindings.ts を生成
```

TS 側はこの生成物を import して Rust を呼びます:

```ts
// apps/<app>/src/ui-widget/task-list/index.ts
import { completeTaskCmd } from "../../task-management/shared/ipc/bindings.js";

const result = await completeTaskCmd({ id: someTask.id });
```

`/ori-flow new-slice` で slice を作るときは、`example-slice/ts/.../shared/ipc/bindings.ts`
を AI が参照し初期スタブを生成するので、初回 Tauri ビルド前でも
`pnpm typecheck` を通せます。Tauri を実際に起動すると tauri-specta が
上書きするので、**手書き編集はしない**でください。

## 6. 最初の slice を派生する

```bash
/ori-distill                                                # phase 1-11 (ドメイン側)
node .apm/skills/ori-flow/scripts/new-slice.js <slice-id>   # ドメインから slice を切り出す
/ori-flow <slice-id>                                        # 7-phase TDD
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
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint    # eslint.config.ori.js を再生成
pnpm lint                                                       # eslint がルール違反を検出

# Rust root → rust adapter
node .apm/skills/ori-arch/scripts/export.js --adapter=rust --root=rs   # apps/<app>/src-tauri/tests/arch.rs を再生成
cd apps/<app>/src-tauri && cargo test --test arch
```

`eslint.config.ori.js` と `apps/<app>/src-tauri/tests/arch.rs` はどちらも
生成物で `.gitignore` 推奨。**architecture.md を編集したら必ず
`export.js` を両 adapter 分走らせる** ことが運用の基本です。

## 8. テスト

```bash
pnpm test           # vitest (TS)
cd apps/<app>/src-tauri && cargo test    # Rust
pnpm typecheck      # tsc --noEmit
```

代表的なテスト (slice ごとに追加):

- `apps/<app>/src/task-management/slices/<slice-id>/tests/*.test.ts` — TS ドメインの unit specs
- `apps/<app>/src/__tests__/ui-flow.test.ts` — UI 2 層 + slice 貫通の e2e
- `apps/<app>/src-tauri/src/task_management/slices/<slice_id>/domain.rs` 内の `#[cfg(test)] mod tests` — Rust ドメイン specs
- `apps/<app>/src-tauri/tests/arch.rs` — 生成物。アーキテクチャ違反検出

## 9. パッケージング

```bash
pnpm tauri build               # 各 OS のインストーラを生成
```

詳細は [Tauri 公式の Distributing ガイド](https://tauri.app/distribute/) を参照。

## 10. 既知の制約

- tauri-specta の v2 RC API は変更頻度が高めです。`lib.rs` に builder を
  組み込むときは upstream 最新の README を確認してください。
- upstream `tauri init` 後の `lib.rs` には初期では tauri-specta の組み込みが
  入っていないため、`/ori-flow new-slice` 初回 (もしくは手動) で
  `tauri_specta::Builder` の collect_commands + bindings 出力部を追加する
  必要があります (example-slice の Rust 側参照)。

## 関連リンク

- [`.apm/contexts/patterns/ddd-vsa-hex/pattern.md`](../../.apm/contexts/patterns/ddd-vsa-hex/pattern.md) — pattern 本体
- [`.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript-tauri/architecture.md.tpl`](../../.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript-tauri/architecture.md.tpl) — render 前の multi-root テンプレート
- [`.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript-tauri/example-slice/`](../../.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript-tauri/example-slice/) — AI 専用 worked example (TS + Rust)
- [`packages/arch-adapter-rust/README.md`](../../packages/arch-adapter-rust/README.md) — Rust adapter
- [Tauri 2 公式ドキュメント](https://tauri.app/)
- [tauri-specta リポジトリ](https://github.com/specta-rs/tauri-specta)
