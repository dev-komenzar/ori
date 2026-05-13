# ori 設計概要

このドキュメントは 2026-05-13 の grill-me セッションで合意した設計事項のスナップショットです。詳細議論は git log + .claude/projects/.../memory/ を参照。

## 設計原則

1. **DDD ドキュメントが Single Source of Truth** — feature・コードは派生
2. **構造から自動抽出** — Phase 9 (workflows) と Phase 11 (ui-fields) から feature を生成
3. **単一伝播アルゴリズム + edit-time SSoT guardrail** — `--force` で派生側編集を許可、proposal を自動生成
4. **CLI = 決定的重処理 / AI = 創造的判断** の責務分離
5. **multi-CLI 中立** — APM で全 AI ツールへ配布、capability-role で model 抽象化

## ディレクトリ規約（対象プロジェクト側）

```
.ori/
├── domain/
│   ├── discovery.md            Phase 1
│   ├── event-storming.md       Phase 2
│   ├── bounded-contexts.md     Phase 3 (H2 = BC)
│   ├── context-map.md          Phase 4
│   ├── aggregates.md           Phase 5 (H2 = Aggregate, {#id} 必須)
│   ├── domain-events.md        Phase 6 (H3 = Event, {#id} 必須)
│   ├── validation.md           Phase 7
│   ├── glossary.md             Phase 8
│   ├── workflows/              Phase 9 (1:1 で分割される唯一の phase)
│   │   ├── index.md            一覧表 + 未解決の問い
│   │   ├── <workflow-id>.md
│   │   └── ...
│   ├── ui-fields/              Phase 11a (画面単位で分割)
│   │   ├── index.md            横断的事項
│   │   ├── screen-N.md
│   │   └── ...
│   └── code/                   Phase 10 生成型
├── features/
│   └── <feature-id>/
│       ├── manifest.yaml       derives_from / type / implementation
│       ├── spec.md             phase 1 (derive) 出力。SSoT 保護対象
│       ├── tests/              phase 3 (test-red) 出力
│       ├── notes.md            実装中の発見ログ
│       └── status.yaml         beads 派生キャッシュ
├── proposals/                  --force 由来の上流提案
├── state/                      snapshot.json (git なし時のフォールバック、gitignore)
└── config.yaml                 モデル選択など
```

## 7-phase per-feature workflow

| # | phase | output | model role |
|---|-------|--------|------|
| 1 | derive | spec.md | deep |
| 2 | plan | beads issue descriptions | deep |
| 3 | test-red | tests/* | deep |
| 4 | impl-green | source code | deep |
| 5 | refactor | source diffs | fast |
| 6 | review | beads comments | **reasoning (fresh)** |
| 7 | sync | dirty 解除 + proposal | fast |

- 各 phase 内で失敗時 1 回 self-fix → それでも失敗なら停止
- subtask は impl-green issue 内の `- [ ]` checklist。別 issue は作らない

## 変更伝播

- **node**: file（workflows/<id>.md 等）または section（{#id}-anchored H2/H3）
- **edge type**: `derives_from`（SSoT 保護）/ `references`（弱通知）
- **propagate()**: 単一関数。隣接ノード全てに `dirty` 通知（CoDD の forward/backward を統一）
- **検知**: git blob 比較が主軸、`.ori/state/snapshot.json` がフォールバック
- **SSoT 保護**: derive_from の target を編集する時 `--force` 必須、自動で `.ori/proposals/` 生成

## モデル選択（capability-role 抽象）

3 role: `fast` / `deep` / `reasoning`

| Agent | fast | deep | reasoning |
|-------|------|------|-----------|
| claude | claude-haiku-4-5 | claude-sonnet-4-6 | **claude-opus-4-7** |
| codex | gpt-4o-mini | gpt-4o | o1 |
| **opencode** | deepseek/deepseek-v4-flash | deepseek/deepseek-v4-pro | deepseek/deepseek-v4-pro |
| gemini | gemini-2.0-flash | gemini-2.0-pro | gemini-2.0-pro-thinking |
| cursor | claude-haiku-4.5 | claude-sonnet-4.6 | claude-opus-4.7 |
| copilot | gpt-4o-mini | gpt-4o | claude-3.5-sonnet |

review phase は **fresh_context: true** で別 session を spawn。

## 配布

- **CLI**: `npm i -g @ori/cli` — 決定的重処理
- **APM パッケージ**: `apm install dev-komenzar/ori` — instructions / skills / agents / hooks
- APM が harness 固有形式に変換（.claude/、.cursor/、.codex/、.opencode/、.windsurf/、.github/）

## 参照リポジトリ

- [distill-ddd](https://github.com/tango238/distill-ddd) — DDD phase 1-11 ベース
- [VCSDD](https://github.com/sc30gsw/vcsdd-claude-code) — workflow 概念、adversarial review
- [CoDD](https://github.com/yohey-w/codd-dev) — coherence graph、change propagation
- [cc-sdd](https://github.com/gotalab/cc-sdd) — 軽量化、autonomous implementation
- [APM](https://github.com/microsoft/apm) — multi-harness 配布

## 関連リポジトリ

- dogfooding 先: [promptnotes-vcsdd](../../promptnotes-vcsdd) — 3 BC、9 workflow、5 UI feature のサンプル
