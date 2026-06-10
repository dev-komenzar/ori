# Start with Languages, Frameworks

ori 自体は言語非依存です。プロジェクトの実装スタックに応じて **pattern**
(`.apm/skills/ori-arch/patterns/<pattern>/`) と **アーキテクチャ adapter** を組み合わせ、
次の三段構えで slice ベース DDD scaffold を立ち上げます (design.md §17):

1. `/ori-init` — `.ori/` skeleton + `config.yaml` を **silent** に生成
2. **upstream framework init** — `pnpm create vite@latest` / `pnpm tauri init` 等を
   ユーザ自身に走ってもらい、`package.json` / `tsconfig.json` / `vitest.config.ts` /
   `eslint.config.js` / `.gitignore` / `README.md` 等 bootstrap 系を揃える
3. `/ori-arch` — pattern / stack を対話で決定し、対応する
   `.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/architecture.md.tpl` を render して
   target の `.ori/architecture.md` 1 ファイルだけを書き出す

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

- ✅ **available** — `architecture.md.tpl` / `example-slice/` / adapter ともに v0.3 で同梱
- 🛠 **experimental** — adapter は使えるが pattern stack はまだ。手動で `.ori/architecture.md` を書く必要あり
- 📋 **planned** — 将来予定。インデックスにスロットだけ確保

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

# 4. architecture.md を render
/ori-arch                                            # pattern / stack を対話で決め render-architecture を実行
pnpm install

# 5. 最初の slice を AI と対話で派生
/ori-distill                                         # phase 1-11 を対話実行 → .ori/domain/ が埋まる
node .apm/skills/ori-flow/scripts/new-slice.js <slice-id>   # workflow から slice を切り出す
/ori-flow <slice-id>                                 # 7-phase TDD を回す
```

スタックごとに違うのはステップ 3 (upstream init コマンド) とステップ 4 (`/ori-arch` で
選ぶ pattern / stack のペア) だけで、その後のワークフローは共通です。スタック固有の
差分 (依存・lint 設定・ビルド手順) は各ガイドに集約しています。

## スタック追加の提案

未対応のスタックを追加したい場合は、

1. `.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/architecture.md.tpl` を追加 (placeholder は `{{APP_NAME}}` / `{{BC_NAME}}` 等)
2. `.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/example-slice/` に worked sample を追加 (AI が `/ori-flow new-slice` で参照する study material)
3. 必要なら新規 adapter (`packages/arch-adapter-<name>/`) を実装
4. このインデックスにエントリを追加して PR

の流れになります。ori 自体は薄いオーケストレータで、スタック固有の知識は pattern stack + adapter に閉じ込める設計です。
