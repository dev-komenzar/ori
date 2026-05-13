# ori（織）

> DDD ドキュメントを Single Source of Truth として、feature ごとに軽量 TDD + CoDD 流の変更伝播を回す開発フレームワーク。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 概要

**ori** は以下を統合した開発支援ツールです：

- **DDD ドキュメント生成**（[distill-ddd](https://github.com/tango238/distill-ddd) ベース）
- **feature 単位の軽量 TDD ワークフロー**（VCSDD を軽量化、[cc-sdd](https://github.com/gotalab/cc-sdd) を参考）
- **CoDD 流の変更伝播**（ドメイン文書 ↔ feature ↔ コードを単一グラフで管理）
- **multi-CLI 配布**（[APM](https://github.com/microsoft/apm) 経由で Claude Code / Codex / OpenCode / Cursor / Copilot / Gemini / Windsurf 対応）

## 設計原則

1. **DDD ドキュメントが Single Source of Truth**
2. **feature への分割は構造から自動抽出**（Phase 9 workflows と Phase 11 ui-fields）
3. **変更伝播は単一アルゴリズム + edit-time guardrail**（`--force` で SSoT 保護を解除）
4. **CLI = 決定的重処理 / AI = 創造的判断**の責務分離
5. **vendor lock-in 回避**：APM で全 AI ツール対応、capability-role でモデル抽象化

## ディレクトリ構造（このリポジトリ）

```
ori/
├── packages/
│   ├── cli/              # @ori/cli — npm 配布の TypeScript CLI
│   ├── parser/           # markdown/frontmatter/section parsing
│   ├── coherence/        # propagation 計算 + ハッシュ管理
│   ├── feature-runner/   # 7-phase workflow runner + beads bridge
│   └── templates/        # DDD コード生成テンプレート（TS/Tauri 等）
├── .apm/                 # APM 配布アセット
│   ├── apm.yml
│   ├── instructions/     # 7 ファイル（規約の自動適用）
│   ├── skills/           # /ori-init, /ori-flow, /ori-sync 等
│   ├── agents/           # ori-reviewer（fresh-context Opus）
│   └── hooks/            # post-write-domain → 自動 sync
└── docs/                 # 設計文書
```

## ユーザのインストール

```bash
# 1. CLI バイナリ（決定的処理）
npm i -g @ori/cli

# 2. AI コンテキスト（skill/agent/hook を各 CLI に配置）
apm install dev-komenzar/ori
```

## 対象プロジェクトでの使い方

```bash
$ cd my-project
$ ori init --template tauri-ts        # .ori/ 構造 + DDD scaffold
$ /ori-distill                         # AI が distill-ddd phase 1-11 を対話実行
$ /ori-flow app-startup                # 1 feature を 7 phase で実装
$ ori sync                             # 変更伝播計算
```

## 状態

🚧 **作業中**：MVP scaffold 段階。動作可能な機能はまだ提供されていません。

詳細な設計議論は [docs/design.md](docs/design.md) を参照。

## ライセンス

MIT — [LICENSE](LICENSE) を参照。
