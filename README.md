# ori（織）

> DDD ドキュメントを Single Source of Truth として、slice ごとに軽量 TDD + CoDD 流の変更伝播を回す開発フレームワーク。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 概要

**ori** は以下を統合した開発支援ツールです：

- **DDD ドキュメント生成**（[distill-ddd](https://github.com/tango238/distill-ddd) ベース）
- **slice 単位の軽量 TDD ワークフロー**（VCSDD を軽量化、[cc-sdd](https://github.com/gotalab/cc-sdd) を参考）
- **CoDD 流の変更伝播**（ドメイン文書 ↔ slice / page ↔ コードを単一グラフで管理）
- **multi-CLI 配布**（[APM](https://github.com/microsoft/apm) 経由で Claude Code / Codex / OpenCode / Cursor / Copilot / Gemini / Windsurf 対応）

## ori は *oriented* なハーネスです

ori は「AI に任意のコードを書かせるための薄いハーネス」ではありません。**「DDD ドキュメント → slice / page + DDD のコード骨格」というアーキテクチャまで指定する、opinionated（oriented）なハーネス**です。

- `/ori-arch` で pattern (`ddd-vsa-hex`) と framework (`typescript` / `typescript-tauri`) を対話で決め、slice ごとに `domain / application / infrastructure / presentation / tests` を切り、`index.ts` を唯一の public API として slice 間の直接 import を禁ずる雛形を吐きます
- `.ori/architecture.md` を SSoT として、arch-adapter が ESLint / Rust 等の言語ネイティブ linter にコンパイルされ、規約逸脱を CI で止めます
- AI に与えるのは「任意のスタイルで書く自由」ではなく「決められたスロットを埋める自由」です

## Getting started

スタック別の開始ガイドは [docs/start/index.md](docs/start/index.md) にまとまっています。代表例:

- [docs/start/typescript-web.md](docs/start/typescript-web.md) — TS 単体（web / Node）
- [docs/start/tauri-v2.md](docs/start/tauri-v2.md) — TS + Rust (Tauri 2)

共通ステップ:

```bash
# 1. インストール（ターゲットディレクトリで）
apm install dev-komenzar/ori

# 2. プロジェクトを scaffold
$ claude/opencode/...                          # Launch your agent
$ /ori-init                                    # .ori/ skeleton + config.yaml (silent)
$ /ori-distill                                 # AI が distill-ddd phase 1-11 を対話実行
$ /ori-arch                                    # pattern / framework を選択 → template scaffold
$ /ori-flow app-startup                        # 1 slice を 7 phase で実装
$ /ori-sync                                    # 変更伝播計算
```

## 設計原則

1. **DDD ドキュメントが Single Source of Truth** — 派生物 (spec / コード) の直接編集は guardrail が止める
2. **変更伝播は単一アルゴリズム** — `--force` で SSoT 保護を解除し、proposal で上流に戻す
3. **CLI = 決定的重処理 / AI = 創造的判断** — vendor lock-in 回避のため APM で multi-CLI 配布、capability-role でモデル抽象化

詳細は [docs/design.md](docs/design.md) を参照。

## ドキュメント

- **利用ガイド**
  - [スタック別 Getting started](docs/start/index.md)
  - [バグが見つかったときの動線](docs/guide/bug-triage.md) — slice 完走後にバグ発覚した際の triage と再走手順
- **コントリビューション**
  - [Contributing 入口](docs/contributing/index.md) — テンプレート募集 / PR ルール / リポジトリ構造
- **設計**
  - [docs/design.md](docs/design.md)

## 状態

**v0.4.0 — greenfield 利用可能**

新規プロジェクトを 0 から立ち上げる動線 (`/ori-init` → `/ori-distill` → `/ori-arch` → `/ori-flow`) は通しで動作します。MVP として `ddd-vsa-hex` パターン + TypeScript / TypeScript-Tauri スタックを sweet spot にサポートしています。

未対応：ブラウンフィールド (既存コードベースへの後付け導入) は `/ori-migrate-domain` を含む v0.5+ のロードマップです。

## ロードマップ

- **v0.3** — CLI 廃止 → skill + scripts ベース実行モデルに全面移行（完了）
- **v0.4** — Slice DoD enforcement chain、DDD 文書 frontmatter 統一（完了）
- **v0.5 以降** — ブラウンフィールド対応 (`/ori-migrate-domain`)、追加 template / arch adapter

詳細は [docs/design.md §19](docs/design.md#19-ロードマップ) を参照。issue tracker は [beads](https://github.com/steveyegge/beads)（prefix `ori-`）で管理しています。

## 名前について

- **ori**（**織**）— "weave" / 織りなす
- **ori-ori**（**折々**）— "from time to time" / "season by season"（四季折々）

DDD 文書・slice / page・コードを 1 つのグラフに**織り**込み、節目（**折々**）に変更を伝播させる、という二重の意味を込めています。npm scope `@ori-ori/` もこの語源に由来します。

## ライセンス

MIT — [LICENSE](LICENSE) を参照。
