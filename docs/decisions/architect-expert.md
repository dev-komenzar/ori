# architect-expert (ori-c79) — 固定 stack テンプレートから動的生成 (agent → スキル) へ転換

- **Issue**: ori-c79 (architect-expert agent: マルチプラットフォーム対応の設計)
- **Status**: 2026-08-28 grill-me セッションで Q1〜Q7 確定 → 実装完了 (c103ce4)
- **更新 (2026-08-31, ori-8gz)**: agent → スキル (`/ori-architect`) に書き直し。Q5・Q8 は **supersede**、Q9 を追記
- **後続**: ori-8gz (agent→スキル変換、完了) / ori-6pb (spawn 配線、ori-8gz で廃止)

## 背景

現状 `/ori-arch` は pattern × stack の **cartesian product** (`.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/architecture.md.tpl`) を対話で選んで render する方式。プラットフォームが増えるたびに `stacks/` に固定テンプレートを追加する必要があり、対応可能な組み合わせ (web+ios+android+desktop+CLI+Electron+Tauri…) の爆発を扱いきれない。

**参考調査**:

- **LobeHub**: React 1 本で Web + Mobile + Electron を同時配信 (UI 層を platform 分岐)
- **Bluesky**: Expo RN で Web + iOS + Android を一本化し、`*.web` / `*.android` / `*.ios` ファイルで差分を表現

どちらも「コードベースは 1 つ、配信/OS 統合の差は stack 側の変数」という構造。ori も「DDD + vsa-hex の核は不変、ビルド/配信/OS 統合は決定点」と整理し、固定テンプレートの代わりに **agent が要件対話から architecture.md を動的生成**する方式へ転換する。

## 設計判断 (grill-me 合意 Q1〜Q7)

### Q1. パターンの核は不変 (invariants)

**確定**: DDD + vsa-hex はパターンの核として不変。`pattern.md` と既存 `stacks/*/architecture.md.tpl` から **layer graph / slice_internal / boundaries** を抽出し、`architect-expert.agent.md` の `invariants:` セクションに集約する (ori-c79.2)。

- layer graph: `ddd-vsa-hex-ts` (shared / domain=slice / ui-widget / ui-page) と `ddd-vsa-hex-rs` (shared / domain=slice) の layers + cross_layer rules + same_layer: prohibited
- slice_internal: 一方向 pipeline (`presentation → application → domain`、`infrastructure → domain`、tests は全層に到達可)。Rust のみ application → infrastructure を許容 (tpl 由来)
- boundaries: public entry 1 ファイル / cross_slice (prohibited_direct, via shared/contracts + shared/events) / cross_bc (app-level shared/ 経由, same_event_bus) / cross_root (generator 生成物、hand-write 禁止)

### Q2. stack 差分は decision_points

**確定**: ビルド / 配信 / OS 統合の差は **stack 側の変数 (decision_points)**。invariants に昇格させない。例えば `forbidden_imports` (@tauri-apps/api/core の raw invoke 禁止) は tauri 特有の決定点であり、invariant ではない。

### Q3. 要件対話の質問項目

**確定**: `platforms` / `os_integration` / `ui_native` 等を質問し、**推奨 + 上書き可** (ハイブリッド UI 対応)。`questions:` セクションに機械 parse 可能な形で定義 (ori-c79.1)。

### Q4. 共有範囲

**確定**: ドメイン / application はプラットフォーム横断で共有し、**presentation を platform 分岐**する。UI は slice の public entry 経由でのみ domain に触れる (invariants の boundaries と同一)。

### Q5. 知識配置と構造セクション

**確定**: 知識は `.apm/agents/architect-expert.agent.md` **1 ファイルのみ** (SKILL.md は触らない)。agent body 内に構造化 **`invariants:` / `guardrails:` / `questions:` / `generation_procedure:`** セクションを必須化し、doctor (ori-doctor) が YAML frontmatter 同様に機械 parse して検証する (ori-c79.3)。各セクションは H2 + ```yaml fenced block で、top-level key がセクション名。

### Q6. 既存テンプレートの扱い

**確定**: 既存 `stacks/*` は**段階的搬送**。reference + golden test (ori-c79.4) として残し、agent 生成結果の妥当性検証に使う。**安定後に除去可** → 削除は ori-c79.6 で実施 (golden test が期待値 SSoT を引き継ぐ)。

### Q7. 適用範囲

**確定**: CLI (`platforms=[server]`、UI なし) から multiplatform (web+ios+android+desktop) まで、**1 つの生成手順** (`generation_procedure`) でカバー。テンプレートの cartesian product をしない。

### Q9. agent → スキルへの書き直し (ori-8gz、2026-08-31) — Q5・Q8 を supersede

**確定**: architect-expert を agent (fresh-context subagent) として配線する案 (Q8) は
**撤回**し、`.apm/skills/ori-architect/SKILL.md` に書き直した。

- **理由**: 要件対話 (ヒアリング) は headless subagent では実行できない。
  ori の agent は「ヒアリング不要の fresh-context 判定」にのみ使う — 実例は
  `ori-reviewer` (review は指定構造を判定するだけ)
- **変換内容**:
  - 構造セクション 4 つ (invariants / guardrails / questions / generation_procedure) は
    スキル本文にそのまま継承 — doctor の機械 parse 契約は不変
  - `## 手順` (elicit → decide → compose → generate → self-check → confirm) を追加し、
    メイン session が対話から生成まで一貫して実行
  - self-check は doctor (`lint.js`) の guardrails g-1..g-8
  - `/ori-arch` 手順 6 は `/ori-architect` への委譲 (spawn の役割分担図は不要)
- **agent と skill の境界** (ori 実行モデルとして明文化):
  - **skill** = メイン session で実行、ユーザ対話可能 (ori-init / ori-distill / ori-flow phases / ori-architect)
  - **agent** = fresh-context subagent、ユーザ対話不可、判定・生成の切り出しに限定 (ori-reviewer)

### Q8. 実行方式の配線 (ori-6pb、2026-08-31 追記) — **ori-8gz で supersede (撤回)**

> 下記は fresh-context spawn 方式を想定した旧決定。ヒアリングが subagent で
> 実行できないため Q9 に置き換え (spawn の役割分担は ori-architect の手順に一元化)。

**確定**: agent は ori-review → ori-reviewer と同じ **fresh-context spawn 方式**で `/ori-arch`
(DDD ドキュメント作成期の arch/stack 決定 step) に配線する。

- **メイン session (ori-arch skill)**: 要件対話を実施 (headless subagent はユーザと
  対話できないため)。対話構造は agent の `questions:` が SSoT
- **spawn**: `.apm/agents/architect-expert.agent.md` を system prompt とする fresh-context
  agent に入力パック (decision_points / app / BC / 生成先) を渡し、
  compose → generate → self-check を実行させる
- **ハンドオフ**: スキル本体が doctor (`lint.js`) guardrails g-1..g-8 で機械検証 →
  ユーザ確定。往復は最大 2 回
- **slice-runner には載せない**: slice-runner の 7 phase は per-slice の flow 用であり、
  arch 決定は DDD ドキュメント作成期の pre-flow step。spawn はスキルレベルの Task agent
  方式 (ori-review と同一)

## 実装

> 実装コミットは squash merge により **c103ce4** (PR #55) に統合 (issue 粒度の履歴は bd 側を参照)。

| issue | 内容 | commit |
| --- | --- | --- |
| ori-c79.2 | invariants 抽出・共通化 (`invariants:` セクション) | c103ce4 |
| ori-c79.1 | `architect-expert.agent.md` 新設 (guardrails / questions / generation_procedure) | c103ce4 |
| ori-c79.3 | ori-doctor に guardrails g-1..g-8 検証ロジック (lint.js) | c103ce4 |
| ori-c79.4 | golden test (agent 生成結果 vs 既存 tpl、IR 正規化 diff) | c103ce4 |
| ori-c79.5 | 本 decision record | c103ce4 |
| ori-c79.6 | stacks/*/architecture.md.tpl 削除 (golden test が phase_hooks 含め期待値 SSoT を引継ぎ) | c103ce4 |
| ori-6pb | ori-arch への spawn 配線 (Q8) — **ori-8gz で廃止** | c103ce4 |
| ori-8gz.1 | ori-architect SKILL.md 新設 + ori-arch 委譲 + agent 削除 (Q9) | c103ce4 |
| ori-8gz.2 | doctor / golden test / render guidance の参照先を ori-architect に更新 | c103ce4 |
| ori-8gz.3 | docs / decision record / README 追従 (本更新) | c103ce4 |

## 参照

- 調査: `lobehub-overview.png` / `lobehub-tree.png` (repo root、grill 時に取得)
- 関連 memory: `task-management-rule` (lazy promote γ rule、子 issue 構成)