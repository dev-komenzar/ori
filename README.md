# ori（織）

> DDD ドキュメントを Single Source of Truth として、slice ごとに軽量 TDD + CoDD 流の変更伝播を回す開発フレームワーク。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 名前について

- **ori**（**織**）— "weave" / 織りなす
- **ori-ori**（**折々**）— "from time to time" / "season by season"（四季折々）

DDD 文書・slice / page・コードを 1 つのグラフに**織り**込み、節目（**折々**）に変更を伝播させる、という二重の意味を込めています。npm scope `@ori-ori/` もこの語源に由来します。

## 概要

**ori** は以下を統合した開発支援ツールです：

- **DDD ドキュメント生成**（[distill-ddd](https://github.com/tango238/distill-ddd) ベース）
- **slice 単位の軽量 TDD ワークフロー**（VCSDD を軽量化、[cc-sdd](https://github.com/gotalab/cc-sdd) を参考）
- **CoDD 流の変更伝播**（ドメイン文書 ↔ slice / page ↔ コードを単一グラフで管理）
- **multi-CLI 配布**（[APM](https://github.com/microsoft/apm) 経由で Claude Code / Codex / OpenCode / Cursor / Copilot / Gemini / Windsurf 対応）

## ori は *oriented* なハーネスです

ori は「AI に任意のコードを書かせるための薄いハーネス」ではありません。**「DDD ドキュメント → slice / page + DDD のコード骨格」というアーキテクチャまで指定する、opinionated（oriented）なハーネス**です。

- `/ori-init` で `.ori/` skeleton を立てたあと `/ori-arch` を呼ぶと、pattern (`ddd-vsa-hex`) と framework (`typescript` / `typescript-tauri`) を対話で決めて、slice ごとに `domain / application / infrastructure / presentation / tests` を切り、`index.ts` を唯一の public API として slice 間の直接 import を禁ずる、slice ベース DDD の雛形を吐きます。
- `.ori/architecture.md` を SSoT として、`@ori-ori/arch-adapter-*` 系の adapter が ESLint や言語ネイティブ linter にコンパイルされ、規約逸脱を CI で止めます。
- AI に与えるのは「任意のスタイルで書く自由」ではなく「決められたスロットを埋める自由」です。創造性は domain modeling と slice 内ロジックに集中させます。

「ハーネスは中立であるべき」という設計とは明確に立場を分けます。ori は中立ではなく、**「これで書け」という方向（ori-ent）を持ったハーネス**です。

## 設計原則

1. **DDD ドキュメントが Single Source of Truth**
2. **slice / page への分割は構造から自動抽出**（Phase 9 workflows と Phase 11 ui-fields）
3. **変更伝播は単一アルゴリズム + edit-time guardrail**（`--force` で SSoT 保護を解除）
4. **CLI = 決定的重処理 / AI = 創造的判断**の責務分離
5. **vendor lock-in 回避**：APM で全 AI ツール対応、capability-role でモデル抽象化

## ディレクトリ構造（このリポジトリ）

```
ori/
├── packages/
│   ├── cli/              # @ori-ori/cli — v0.3 で deprecated。配布は APM (.apm/) に移行
│   ├── parser/           # markdown/frontmatter/section parsing
│   ├── coherence/        # propagation 計算 + ハッシュ管理
│   ├── slice-runner/     # 7-phase workflow runner + beads bridge
│   └── templates/        # DDD コード生成テンプレート（TS/Tauri 等）
├── .apm/                 # APM 配布アセット
│   ├── apm.yml
│   ├── instructions/     # 7 ファイル（規約の自動適用）
│   ├── skills/           # /ori-init, /ori-flow, /ori-sync 等
│   ├── agents/           # ori-reviewer（fresh-context Opus）
│   └── hooks/            # post-write-domain → 自動 sync
└── docs/                 # 設計文書
```

## Getting started

スタック別の開始ガイドは [docs/start/index.md](docs/start/index.md) に
まとまっています。代表例:

- [docs/start/typescript-web.md](docs/start/typescript-web.md) — TS 単体（web / Node）
- [docs/start/tauri-v2.md](docs/start/tauri-v2.md) — TS + Rust (Tauri 2)

共通ステップ:

```bash
# 1. インストール
apm install dev-komenzar/ori

# 2. プロジェクトを scaffold
$ cd my-project
$ /ori-init                                    # .ori/ skeleton + config.yaml (silent)
$ /ori-arch                                    # pattern=ddd-vsa-hex / framework=typescript[-tauri] を選択 → template scaffold
$ /ori-distill                                 # AI が distill-ddd phase 1-11 を対話実行
$ /ori-flow app-startup                        # 1 slice を 7 phase で実装
$ /ori-sync                                    # 変更伝播計算
```

## init テンプレートを募集しています

現状の `/ori-arch` は MVP として `ddd-vsa-hex-typescript` / `ddd-vsa-hex-typescript-tauri`（slice ベース + DDD + Vertical Slice + Hexagonal）を中心にサポートしています。将来的には**コミュニティから template を集めたい**と考えています：

- **言語別**: Python / Go / Rust / Kotlin / Scala / Swift...
- **フレームワーク別**: Next.js / Nuxt / Remix / Django / FastAPI / Spring / Axum / Tauri...
- **アーキテクチャ別**: slice + DDD / Clean Architecture / Hexagonal / Onion / VSA...

各テンプレートは「slice ごとのディレクトリ骨格 + 単一 public API（`index.ts` 相当）+ `.ori/architecture.md` を生成する arch-adapter 設定」の 3 点を満たせば ori と整合します。adapter は現在 ESLint / 汎用 regex / Rust が APM bundle 経由 (`.apm/contexts/adapters/{eslint,generic,rust}/`) で利用可能で、Python (import-linter) / JVM (ArchUnit) / Go (depguard) などは計画中です。

興味がある方は [issues](https://github.com/dev-komenzar/ori/issues) または discussions で声をかけてください。

## バグが見つかったときの動線

1 slice を 7 phase で完走した後、ヒューマンチェックでバグが発覚した場合、**バグの所在をグラフ上のどのノードに帰属させるか**で分類し、それぞれ対応する動線を取ります。

### バグの分類（triage）

| # | バグの所在 | 症状 | 起点 |
|---|----------|------|------|
| **1** | **ドメインモデル**が誤り | 不変条件が抜けていた、概念の境界が違った | `.ori/domain/` を編集 |
| **2** | **spec は正しいが impl が誤り**（テスト網羅漏れ） | impl がエッジケースで落ちる | 失敗テストを追加 |
| **3** | **spec 自体に欠陥**（domain は正しいが derive が悪い） | 派生時に取りこぼし／曲解 | `--force` で spec 編集 → proposal |
| **4** | **複数 slice の統合バグ** | 単体ではテスト通るが組み合わせで破綻 | 新規 slice 作成 |

判別の質問順序：

- 「ドメインモデルが捉え損ねている事象か？」→ Yes → **ケース 1**
- 「spec.md にこの動作の規定があるか？」→ No → **ケース 3**
- 「spec の規定通り impl が動かない？」→ Yes → **ケース 2**
- 「単一 slice の範囲を超える？」→ Yes → **ケース 4**

### ケース 1：ドメインバグ（最も典型）

例：`aggregates.md#note-aggregate` の不変条件「body 編集後 `updatedAt` が必ず増分」が抜けていた。

```bash
$ vim .ori/domain/aggregates.md       # 不変条件を追加
$ /ori-sync
⚠ Changed: domain/aggregates.md#note-aggregate
  Propagating to derived slices:
    - slices/capture-auto-save (spec.md is now dirty)
    - slices/edit-past-note-start (spec.md is now dirty)
✓ Reopened beads issues: ori-derive-capture-auto-save, ori-derive-edit-past-note-start

$ /ori-flow capture-auto-save         # 再 derive → test-red → impl-green → review
```

1 つのドメイン編集 → 影響する全 slice が**自動で dirty 化**。ori が manifest の `derives_from` を辿って影響範囲を計算します。

### ケース 2：実装バグ（spec は正しい）

例：spec.md には「空 Note を破棄」と書かれているが、impl が「空白だけの Note」を見逃していた。

```bash
$ vim .ori/slices/capture-auto-save/tests/empty-note.test.ts
#   失敗テストを追加（whitespace-only も isEmpty に含める）

$ pnpm test
✗ FAIL

$ /ori-flow capture-auto-save --phase impl-green \
    --reason "manual bug report: whitespace handling"
✓ AI が isEmpty() を String#trim() ベースに修正

$ /ori-flow capture-auto-save --phase review     # 推奨
```

ドメイン文書には触れず、`--phase impl-green` で**該当 phase だけピンポイント再実行**。`--reason` が beads コメントに残ります。

### ケース 3：spec バグ（domain は正しいが derive が悪い）

例：domain には「`Tag` は小文字正規化」と書かれているのに、spec.md がそれを取りこぼしていた。

```bash
$ vim .ori/slices/ui-tag-chip/spec.md
$ /ori-sync
✗ ERROR: spec.md is derived. Edit blocked.
  Options:
    [1] Edit domain source: domain/aggregates.md#tag-vo
    [2] Force edit + upstream proposal:  /ori-sync --force slices/ui-tag-chip/spec.md
```

SSoT 保護が「曖昧な箇所をドメインに戻す動線」を強制します。多くの場合 domain を直すのが正解。どうしても spec で局所決定したい場合は `--force` + proposal で上流レビューを残します。

### ケース 4：統合バグ（複数 slice にまたがる）

例：`capture-auto-save` と `edit-past-note-start` が個別では正しいが、組み合わせ時の自動保存タイミングが競合する。

```bash
$ /ori-distill phase=workflows
#   distill-ddd Phase 9 に戻り、欠落していたシナリオを workflows/switch-edit-target.md として追加

$ node .apm/skills/ori-flow/scripts/new-slice.js switch-edit-target
$ /ori-flow switch-edit-target
```

統合バグは「**ドメインモデルにシナリオが欠けていた**」こととほぼ同義。既存 slice を編集せず**新規 slice として切り出す**ことで境界を明確にします。

### 共通の流れ

> **バグの所在を ori graph 上のノードに対応づける → そのノードを編集する → propagation が必要な phase を自動 reopen → AI が phase を再走 → review で再検証**

人間がやるべき判断は「**どのノードにバグがあるか**」のみ。残りの dirty 計算・再 derive・実装修正・レビューは ori workflow が機械的に運びます。

### アンチパターン

| やってはいけないこと | 理由 |
|------------------|------|
| impl を直接 patch、テスト・spec は触らない | 次の derive で実装が上書きされ消える。テストが守らない |
| spec.md を `--force` なしで直接編集 | guardrail が止める。drift が git history で検出される |
| ドメインを直さず、複数 slice の spec で局所対応 | 同じバグの暗黒コピーが各所に発生。CoDD の意義を失う |
| review を skip | adversarial 視点なしで「自分の修正は正しい」と確信してしまう |

## 状態

🚧 **作業中**：MVP scaffold 段階。動作可能な機能はまだ提供されていません。

詳細な設計議論は [docs/design.md](docs/design.md) を参照。

## ロードマップ

- **v0.2 (作業中)** — /ori-flow 実行ギャップ解消。APM package 配布と `ori slice run` MVP は完了、残りは `/ori-plan` SKILL.md 改訂 (`ori-zds`)
- **v0.3** — CLI 廃止 → skill + scripts ベース実行モデルへ全面移行。`@ori-ori/cli` を含む `@ori-ori/*` 4 packages を npm deprecate (epic `ori-1ny`)
- **v0.4 以降** — ブラウンフィールド対応 (`/ori-migrate-domain`、`ori-5wv` / `ori-6us` / `ori-29p` deferred)、追加 template (Python / Go / Rust / Kotlin / Next.js / Django 等 — 本 README「init テンプレートを募集しています」参照)、追加 arch adapter (import-linter / ArchUnit / depguard 等)

詳細は [docs/design.md §19](docs/design.md#19-ロードマップ) を参照。issue tracker は [beads](https://github.com/steveyegge/beads)（prefix `ori-`）で管理しています。

## ライセンス

MIT — [LICENSE](LICENSE) を参照。
