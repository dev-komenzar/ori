# Start with Languages, Frameworks

ori 自体は言語非依存です。プロジェクトの実装スタックに応じて **pattern**
(`.apm/skills/ori-arch/patterns/<pattern>/`) と **アーキテクチャ adapter** を組み合わせ、
次の三段構えで slice ベース DDD scaffold を立ち上げます (design.md §17)。

> **ori の大フロー**:
> 1. **DDD ドキュメント作成** — ori-init → **arch/stack 決定 (`/ori-arch`)** → distill-ddd
>    (discovery 〜 ui-grouping)
> 2. **slice / page ごとに ori-flow**（derive → plan → test-red → impl-green →
>    refactor → review → finalize）

1. `/ori-init` — `.ori/` skeleton + `config.yaml` を **silent** に生成
2. **upstream framework init** — `pnpm create vite@latest` / `pnpm tauri init` 等を
   ユーザ自身に走ってもらい、`package.json` / `tsconfig.json` / `vitest.config.ts` /
   `eslint.config.js` / `.gitignore` / `README.md` 等 bootstrap 系を揃える
3. `/ori-arch` — **`/ori-architect` スキルに委譲**して `architecture.md` を生成 (ori-8gz)。
   - ori-architect (メイン session で実行) が要件対話 (platforms / os_integration /
     ui_native 等、`questions:` ベース) を実施し decision_points を確定
   - invariants から IR を組み立て `.ori/architecture.md` 1 ファイルを生成 +
     guardrails (g-1..g-8) 自己検証 (doctor `lint.js`)
   - ユーザ確定を取る
   - DDD + vsa-hex の核 (invariants) は不変で、ビルド/配信/OS 統合の差は decision_points。
     固定 `stacks/<stack>/architecture.md.tpl` の cartesian product 方式は ori-c79 で
     置き換え済み (旧 tpl は golden test の期待値 SSoT に引き継がれた)

`example-slice/` (`.apm/skills/ori-arch/patterns/<p>/stacks/<s>/example-slice/`) は target に
物理コピーされず、AI 専用の study material として skill 側に保持され `/ori-flow new-slice`
等から on-demand で参照されます。

このページは「自分のスタック向けの開始ガイド」へ誘導するインデックスです。

## サポート状況

| スタック                                    | 状態          | pattern × stack                                                                                              | adapter                                                                   | 開始ガイド                                |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------- |
| **TypeScript (web/Node)**                   | ✅ available  | [`ddd-vsa-hex/stacks/typescript/`](../../.apm/skills/ori-arch/patterns/ddd-vsa-hex/stacks/typescript/)              | [`@ori-ori/arch-adapter-eslint`](../../packages/arch-adapter-eslint)      | [typescript-web.md](./typescript-web.md)  |
| **TypeScript + Rust (Tauri 2)**             | ✅ available  | [`ddd-vsa-hex/stacks/typescript-tauri/`](../../.apm/skills/ori-arch/patterns/ddd-vsa-hex/stacks/typescript-tauri/)  | eslint (TS) + [`arch-adapter-rust`](../../packages/arch-adapter-rust)     | [tauri-v2.md](./tauri-v2.md)              |
| **Rust (server / CLI)**                     | 🛠 experimental | _no pattern stack yet_                                                                                       | [`@ori-ori/arch-adapter-rust`](../../packages/arch-adapter-rust)          | _planned_                                 |
| **Python (FastAPI / Django)**               | 📋 planned     | —                                                                                                            | `arch-adapter-import-linter` (planned)                                    | _planned_                                 |
| **Go**                                      | 📋 planned     | —                                                                                                            | `arch-adapter-go-deps` (planned)                                          | _planned_                                 |
| **Kotlin / JVM (Spring, Ktor)**             | 📋 planned     | —                                                                                                            | `arch-adapter-archunit` (planned)                                         | _planned_                                 |
| **Java (Spring)**                           | 📋 planned     | —                                                                                                            | `arch-adapter-archunit` (planned)                                         | _planned_                                 |
| **Any language (fallback)**                 | ✅ available  | _bring your own architecture.md_                                                                             | [`@ori-ori/arch-adapter-generic`](../../packages/arch-adapter-generic)    | _DIY — see adapter README_                |

凡例:

- ✅ **available** — 生成フロー (ori-architect スキル) / `example-slice/` / adapter ともに同梱
- 🛠 **experimental** — adapter は使えるが pattern stack はまだ。手動で `.ori/architecture.md` を書く必要あり
- 📋 **planned** — 将来予定。インデックスにスロットだけ確保

> 注: `stacks/<stack>/architecture.md.tpl` (固定テンプレート) は ori-c79 で廃止され、
> `example-slice/` と golden test fixture のみが参照物として残っています。

## 共通ステップ

スタックを問わず、ori プロジェクトの立ち上げは以下のステップです (design.md §17 三段構え)。

```bash
# 1. インストール
apm install dev-komenzar/ori

# 2. プロジェクトディレクトリで初期化
mkdir my-app && cd my-app
/ori-init                                            # .ori/ skeleton + config.yaml (silent)

# 3. upstream framework init (例: pure TypeScript)
mkdir -p apps/my-app && cd apps/my-app
pnpm create vite@latest . --template vanilla-ts      # package.json / tsconfig.json 等が揃う
cd ../..

# 4. architecture.md を生成 (arch/stack 決定)
/ori-arch                                            # /ori-architect に委譲して要件対話から生成 (ori-8gz)
pnpm install

# 5. 最初の slice を AI と対話で派生
/ori-distill                                         # phase 1-11 を対話実行 → .ori/domain/ が埋まる
node .apm/skills/ori-flow/scripts/new-slice.js <slice-id>   # workflow から slice を切り出す
/ori-flow <slice-id>                                 # 7-phase TDD を回す
```

スタックごとに違うのはステップ 3 (upstream init コマンド) とステップ 4 (`/ori-arch` → `/ori-architect` で要件対話させる) だけで、その後のワークフローは共通です。スタック固有の
差分 (依存・lint 設定・ビルド手順) は各ガイドに集約しています。

## スタック追加の提案

未対応のスタックを追加したい場合は、agent ベースの制約に従います:

1. **requirement dialogue** — `/ori-architect` に対話させることで、新スタックの
   decision_points (language / adapter / cross_root 等) が既存の guardrails を
   満たす出力を生成できることを確認する (`questions:` / `generation_procedure:` 参照)
2. `.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/example-slice/` に worked sample を追加 (AI が `/ori-flow new-slice` で参照する study material)
3. 生成結果の golden fixture (`packages/skills/ori-arch/tests/fixtures/agent-generated/`) を追加し、
   `golden-agent-vs-tpl.test.ts` と doctor guardrails で検証する
3. 必要なら新規 adapter (`packages/arch-adapter-<name>/`) を実装
4. このインデックスにエントリを追加して PR

の流れになります。ori 自体は薄いオーケストレータで、スタック固有の知識は pattern stack + adapter に閉じ込める設計です。
