# Start with Languages, Frameworks

ori 自体は言語非依存です。プロジェクトの実装スタックに応じて **pattern**
(`.apm/skills/ori-architect/patterns/<pattern>/`) と **アーキテクチャ adapter** を組み合わせ、
次のステップで slice ベース DDD scaffold を立ち上げます (design.md §17)。

> **ori の大フロー**: **DDD → `/ori-architect` → `/ori-bootstrap` → `/ori-flow`**
> 1. **DDD ドキュメント作成** — `/ori-init` → `/ori-distill` (discovery 〜 ui-grouping)
> 2. **architecture 決定** (`/ori-architect`) — 要件対話で `.ori/architecture.md` を生成。
>    `apps/` は未初期化でよい
> 3. **codebase 準備** (`/ori-bootstrap`) — architecture.md から stack を確定し、
>    upstream framework init (`pnpm create vite@latest` / `pnpm tauri init` 等) を案内、
>    runner deps / (tauri) specta scaffold を apply し、readiness verify
>    (`bootstrap.js verify`) で app が build 可能かを判定
> 4. **slice / page ごとに ori-flow**（derive → plan → test-red → impl-green →
>    refactor → review → finalize）

1. `/ori-init` — `.ori/` skeleton + `config.yaml` を **silent** に生成
2. `/ori-distill` — DDD phase 1-11 を対話実行し `.ori/domain/` を埋める
3. `/ori-architect` — `architecture.md` を生成 (ori-8gz)。旧 `/ori-arch` は本スキルに統合・廃止 (ori-63f)。
   - ori-architect (メイン session で実行) が要件対話 (platforms / os_integration /
     ui_native 等、`questions:` ベース) を実施し decision_points を確定
   - invariants から IR を組み立て `.ori/architecture.md` 1 ファイルを生成 +
     guardrails (g-1..g-8) 自己検証 (doctor `lint.js`)
   - ユーザ確定を取る
   - DDD + vsa-hex の核 (invariants) は不変で、ビルド/配信/OS 統合の差は decision_points。
     固定 `stacks/<stack>/architecture.md.tpl` の cartesian product 方式は ori-c79 で
     置き換え済み (旧 tpl は golden test の期待値 SSoT に引き継がれた)
4. `/ori-bootstrap` — upstream framework init を **ユーザ自身に** 走ってもらい
   (skill は自動実行しない)、`package.json` / `tsconfig.json` / `vitest.config.ts` /
   `eslint.config.js` / `.gitignore` / `README.md` 等 bootstrap 系を揃える。
   続けて `node .apm/skills/ori-bootstrap/scripts/bootstrap.js verify` で readiness を検証する

`example-slice/` (`.apm/skills/ori-architect/patterns/<p>/stacks/<s>/example-slice/`) は target に
物理コピーされず、AI 専用の study material として skill 側に保持され `/ori-flow new-slice`
等から on-demand で参照されます。

このページは「自分のスタック向けの開始ガイド」へ誘導するインデックスです。

## サポート状況

| スタック                                    | 状態          | pattern × stack                                                                                              | adapter                                                                   | 開始ガイド                                |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------- |
| **TypeScript (web/Node)**                   | ✅ available  | [`ddd-vsa-hex/stacks/typescript/`](../../.apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript/)              | [`@ori-ori/arch-adapter-eslint`](../../packages/arch-adapters/eslint)      | [typescript-web.md](./typescript-web.md)  |
| **TypeScript + Rust (Tauri 2)**             | ✅ available  | [`ddd-vsa-hex/stacks/typescript-tauri/`](../../.apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript-tauri/)  | eslint (TS) + [`arch-adapter-rust`](../../packages/arch-adapters/rust)     | [tauri-v2.md](./tauri-v2.md)              |
| **Rust (server / CLI)**                     | 🛠 experimental | _no pattern stack yet_                                                                                       | [`@ori-ori/arch-adapter-rust`](../../packages/arch-adapters/rust)          | _planned_                                 |
| **Python (FastAPI / Django)**               | 📋 planned     | —                                                                                                            | `arch-adapter-import-linter` (planned)                                    | _planned_                                 |
| **Go**                                      | 📋 planned     | —                                                                                                            | `arch-adapter-go-deps` (planned)                                          | _planned_                                 |
| **Kotlin / JVM (Spring, Ktor)**             | 📋 planned     | —                                                                                                            | `arch-adapter-archunit` (planned)                                         | _planned_                                 |
| **Java (Spring)**                           | 📋 planned     | —                                                                                                            | `arch-adapter-archunit` (planned)                                         | _planned_                                 |
| **Any language (fallback)**                 | ✅ available  | _bring your own architecture.md_                                                                             | [`@ori-ori/arch-adapter-generic`](../../packages/arch-adapters/generic)    | _DIY — see adapter README_                |

凡例:

- ✅ **available** — 生成フロー (ori-architect スキル) / `example-slice/` / adapter ともに同梱
- 🛠 **experimental** — adapter は使えるが pattern stack はまだ。手動で `.ori/architecture.md` を書く必要あり
- 📋 **planned** — 将来予定。インデックスにスロットだけ確保

> 注: `stacks/<stack>/architecture.md.tpl` (固定テンプレート) は ori-c79 で廃止され、
> `example-slice/` と golden test fixture のみが参照物として残っています。

## 共通ステップ

スタックを問わず、ori プロジェクトの立ち上げは以下のステップです (design.md §17)。

```bash
# 1. インストール
apm install dev-komenzar/ori

# 2. プロジェクトディレクトリで初期化
mkdir my-app && cd my-app
/ori-init                                            # .ori/ skeleton + config.yaml (silent)

# 3. DDD ドキュメント作成 (phase 1-11)
/ori-distill                                         # phase 1-11 を対話実行 → .ori/domain/ が埋まる

# 4. architecture.md を生成
/ori-architect                                       # 要件対話から生成 (apps/ は未初期化でよい)

# 5. codebase 準備: /ori-bootstrap が stack を確定して upstream framework init を案内
/ori-bootstrap
mkdir -p apps/my-app && cd apps/my-app
pnpm create vite@latest . --template vanilla-ts      # package.json / tsconfig.json 等が揃う (例: pure TypeScript)
pnpm install
cd ../..
/ori-bootstrap                                       # 再実行: runner deps 追加 (+ tauri なら specta scaffold apply)
node .apm/skills/ori-bootstrap/scripts/bootstrap.js verify   # readiness 検証 (静的 + build)

# 6. 最初の slice を派生して実装
node .apm/skills/ori-flow/scripts/new-slice.js <slice-id>   # workflow から slice を切り出す
/ori-flow <slice-id>                                 # 7-phase TDD を回す
```

スタックごとに違うのはステップ 4 (`/ori-architect` の要件対話の結果) とステップ 5 (`/ori-bootstrap` が案内する upstream init コマンド) だけで、その後のワークフローは共通です。スタック固有の
差分 (依存・lint 設定・ビルド手順) は各ガイドに集約しています。

## スタック追加の提案

未対応のスタックを追加したい場合は、agent ベースの制約に従います:

1. **requirement dialogue** — `/ori-architect` に対話させることで、新スタックの
   decision_points (language / adapter / cross_root 等) が既存の guardrails を
   満たす出力を生成できることを確認する (`questions:` / `generation_procedure:` 参照)
2. `.apm/skills/ori-architect/patterns/<pattern>/stacks/<stack>/example-slice/` に worked sample を追加 (AI が `/ori-flow new-slice` で参照する study material)
3. 生成結果の golden fixture (`packages/skills/ori-architect/tests/fixtures/agent-generated/`) を追加し、
   `golden-agent-vs-tpl.test.ts` と doctor guardrails で検証する
3. 必要なら新規 adapter (`packages/arch-adapters/<name>/`) を実装
4. このインデックスにエントリを追加して PR

の流れになります。ori 自体は薄いオーケストレータで、スタック固有の知識は pattern stack + adapter に閉じ込める設計です。
