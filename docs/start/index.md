# Start with Languages, Frameworks

ori 自体は言語非依存です。プロジェクトの実装スタックに応じて **テンプレート**
と **アーキテクチャ adapter** を組み合わせ、`ori init --template <name>` の
1 コマンドで slice ベース DDD scaffold を立ち上げます。

このページは「自分のスタック向けの開始ガイド」へ誘導するインデックスです。

## サポート状況

| スタック                                    | 状態          | テンプレート              | adapter                                                                   | 開始ガイド                                |
| ------------------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| **TypeScript (web/Node)**                   | ✅ available  | `ddd-typescript`          | [`@ori-ori/arch-adapter-eslint`](../../packages/arch-adapter-eslint)      | [typescript-web.md](./typescript-web.md)  |
| **TypeScript + Rust (Tauri 2)**             | ✅ available  | `ddd-typescript-tauri`    | eslint (TS) + [`arch-adapter-rust`](../../packages/arch-adapter-rust)     | [tauri-v2.md](./tauri-v2.md)              |
| **Rust (server / CLI)**                     | 🛠 experimental | _no template yet_         | [`@ori-ori/arch-adapter-rust`](../../packages/arch-adapter-rust)          | _planned_                                 |
| **Python (FastAPI / Django)**               | 📋 planned     | —                         | `arch-adapter-import-linter` (planned)                                    | _planned_                                 |
| **Go**                                      | 📋 planned     | —                         | `arch-adapter-go-deps` (planned)                                          | _planned_                                 |
| **Kotlin / JVM (Spring, Ktor)**             | 📋 planned     | —                         | `arch-adapter-archunit` (planned)                                         | _planned_                                 |
| **Java (Spring)**                           | 📋 planned     | —                         | `arch-adapter-archunit` (planned)                                         | _planned_                                 |
| **Any language (fallback)**                 | ✅ available  | _bring your own_          | [`@ori-ori/arch-adapter-generic`](../../packages/arch-adapter-generic)    | _DIY — see adapter README_                |

凡例:

- ✅ **available** — テンプレート / adapter ともに v0.1 で同梱
- 🛠 **experimental** — adapter は使えるがテンプレートはまだ。手動で `.ori/architecture.md` を書く必要あり
- 📋 **planned** — v0.2 以降の予定。インデックスにスロットだけ確保

## 共通ステップ

スタックを問わず、ori プロジェクトの立ち上げは以下 3 ステップです。

```bash
# 1. ori 本体（CLI + AI 配布物）をインストール
npm i -g @ori-ori/cli
apm install dev-komenzar/ori

# 2. プロジェクトディレクトリで scaffold 生成
mkdir my-app && cd my-app
ori init --template <template-name>
pnpm install

# 3. 最初の slice を AI と対話で派生
/ori-distill                # phase 1-11 を対話実行 → .ori/domain/ が埋まる
ori slice new <slice-id>    # workflow から slice を切り出す
/ori-flow <slice-id>        # 7-phase TDD を回す
```

`<template-name>` 部分が違うだけで、生成物の構造とその後のワークフローは
同じです。スタック固有の差分（依存・lint 設定・ビルド手順）は各ガイドに
集約しています。

## スタック追加の提案

未対応のスタックを追加したい場合は、

1. テンプレートを `packages/templates/<name>/` として追加
2. 必要なら新規 adapter (`packages/arch-adapter-<name>/`) を実装
3. このインデックスにエントリを追加して PR

の流れになります。ori 自体は薄いオーケストレータで、スタック固有の知識は
テンプレート + adapter に閉じ込める設計です。
