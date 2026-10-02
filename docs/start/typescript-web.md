# Start: TypeScript (web / Node)

`pattern:ddd-vsa-hex` × `stack:typescript` で、Web フロントエンド単体、または
Node 製サーバ単体のプロジェクトに ori の slice ベース DDD scaffold を
立ち上げます。Tauri を併用したい場合は [tauri-v2.md](./tauri-v2.md) を
参照。

## 1. 前提

| 要件     | バージョン  | 補足                                       |
| -------- | ----------- | ------------------------------------------ |
| Node     | >= 20       | `nvm` 推奨                                 |
| pnpm     | >= 9        | `corepack enable` で OK                    |
| APM      | latest      | `apm install dev-komenzar/ori`             |

```bash
node --version       # v20.x or higher
pnpm --version       # 9.x or higher
```

## 2. プロジェクト初期化 (architect → bootstrap)

大フロー: **DDD (`/ori-init` → `/ori-distill`) → `/ori-architect` → `/ori-bootstrap` → `/ori-flow`** (design.md §17)。
architecture (stack) を先に確定し、その結果に基づいて `/ori-bootstrap` が upstream init を案内する。

```bash
mkdir my-ts-app && cd my-ts-app

# ステップ 1: .ori/ skeleton + config.yaml (silent)
/ori-init
/ori-distill                                         # DDD phase 1-11

# ステップ 2: architecture.md を生成
/ori-architect                                       # 要件対話から生成 (apps/ は未初期化でよい)

# ステップ 3: codebase 準備 — /ori-bootstrap が stack=typescript を確定し、
#   下記の upstream framework init を案内する (自動実行はしない。ユーザが直接実行)
#   bootstrap 系 (package.json / tsconfig.json / vitest.config.ts /
#   eslint.config.js / .gitignore / README.md) はここで揃う
/ori-bootstrap
mkdir -p apps/my-ts-app && cd apps/my-ts-app
pnpm create vite@latest . --template vanilla-ts
pnpm install
cd ../..

# ステップ 4: readiness 検証 (静的 + build。exit 0=PASS / 1=FAIL)
node .apm/skills/ori-bootstrap/scripts/bootstrap.js verify
```

役割分担:

- `/ori-init` （ステップ 1） — **silent**。`.ori/` skeleton と
  `.ori/config.yaml`、domain scaffold seed のみ生成。プロジェクトルートには
  `package.json` 等を書かない。
- `/ori-architect` （ステップ 2） — **`/ori-architect` スキル** (`.apm/skills/ori-architect/SKILL.md`)
  が要件対話 (platforms / os_integration / ui_native) から `.ori/architecture.md`
  1 ファイルだけを生成する。`apps/` には何も書かない。
- `/ori-bootstrap` （ステップ 3-4） — architecture.md から stack を確定して
  **upstream framework init** (`pnpm create vite@latest` 等) を案内する。ori は
  network / 対話 / 既存ファイル削除リスクを避けるため自動実行しない。
  続けて runner deps (root package.json) を追加し、`bootstrap.js verify` で
  app が build 可能かを判定する。

既存 `.ori/architecture.md` がある場合は上書き可否を確認してから生成する。
app 名 / BC 名 は要件対話の回答 (`questions:`) に従って埋められる。

## 3. 推奨される構造

`/ori-flow new-slice <id>` で slice を作るとき、AI は
`.apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript/example-slice/`
を参照して以下のような構造を生成します:

```
apps/<app>/src/
├── task-management/                       # BC (slice_root) — {{BC_NAME}} に解決
│   ├── shared/                            # BC-internal shared (kind: shared)
│   │   ├── types/                         # Result, branded types
│   │   ├── events/                        # DomainEvent shape
│   │   └── contracts/                     # cross-slice ports (空)
│   └── slices/                            # slice_subdir = slices
│       └── <slice-id>/                    # 1 slice = 1 folder
│           ├── index.ts                   # ← 唯一の public API
│           ├── domain/                    # 純粋 (aggregates, VOs, events)
│           ├── application/               # use-case 配線
│           ├── infrastructure/            # I/O adapters
│           ├── presentation/              # view model + render
│           └── tests/
├── ui-widget/                             # ddd-vsa-hex ui-layer (order 1)
├── ui-page/                               # ddd-vsa-hex ui-layer (order 2)
└── __tests__/
    └── ui-flow.test.ts                    # page -> widget -> slice
```

主要ルール (ori-architect が生成する `.ori/architecture.md` に
guardrails として宣言・検証される):

- **slice 公開面は `index.ts` のみ。** 他 slice からは `slices/<slice>/index.ts` 経由でしか触れません
- **UI 層は片方向**: `ui-page -> ui-widget -> {shared, domain}`（design.md §6 の 2 層 ddd-vsa-hex）
- **UI 層は slice の `index.ts` を介してドメインへ到達**（slice 内部直接 import は禁止）
- **同層内の sibling import は禁止**（widget A → widget B など）

ルールはコードではなく `.ori/architecture.md` のフロントマターに宣言され、
`eslint-plugin-boundaries` 用の lint 設定に compile されます。

## 4. 最初の slice を派生する

```bash
# AI と対話して DDD phase 1-11 を進める（.ori/domain/ に成果物が落ちる）
/ori-distill

# 抽出された workflow から slice を切り出す
node .apm/skills/ori-flow/scripts/new-slice.js switch-edit-target

# 7-phase TDD を走らせる
/ori-flow switch-edit-target
```

`/ori-flow new-slice` は `.apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript/example-slice/`
を on-demand で読み、ユーザの実ドメインに沿った slice を直接生成する
（example-slice 自体は target にコピーされない）。

## 5. アーキテクチャ lint の運用

`.ori/architecture.md` が編集されるたびに lint 設定を再生成します:

```bash
node .apm/skills/ori-architect/scripts/export.js --adapter=eslint    # eslint.config.ori.js を生成
pnpm lint                                                       # eslint がルール違反を検出
```

upstream init で `eslint.config.js` を書いた場合は、その中で
`eslint.config.ori.js` を import / spread して合成するのが慣習。
`eslint.config.ori.js` は generated 物で `.gitignore` 推奨。常に
architecture.md が source of truth です。

## 6. テスト

```bash
pnpm test               # vitest run (upstream init で導入)
pnpm test:watch         # 開発中
pnpm typecheck          # tsc --noEmit
```

`/ori-flow` で slice を作るたびに、生成された slice 配下の
`tests/` と `apps/<app>/src/__tests__/ui-flow.test.ts` に
unit / integration テストを追加します。

## 7. よくある拡張

- **新しい domain slice** — `/ori-flow new-slice <id>` で scaffold → 7-phase 開発
- **新しい UI 層**（例: `ui-shell`） — `.ori/architecture.md` の `layers` と `rules.cross_layer` に追加 → `node .apm/skills/ori-architect/scripts/export.js --adapter=eslint`
- **cross-slice の連携** — まず `apps/<app>/src/<bc>/shared/contracts/<name>.ts` でポートを定義し、両 slice が contract に依存する形にする

## 関連リンク

- [`.apm/skills/ori-architect/patterns/ddd-vsa-hex/pattern.md`](../../.apm/skills/ori-architect/patterns/ddd-vsa-hex/pattern.md) — pattern 本体 (Summary / Tradeoffs / Layer responsibilities 等)
- [`.apm/skills/ori-architect/SKILL.md`](../../.apm/skills/ori-architect/SKILL.md) — architecture.md 生成スキル (invariants / guardrails / questions / generation_procedure)
- [`.apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript/example-slice/`](../../.apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript/example-slice/) — AI 専用 worked example
- [`packages/skills/ori-architect/tests/fixtures/golden-constants.ts`](../../packages/skills/ori-architect/tests/fixtures/golden-constants.ts) — agent 生成結果の期待 IR (旧 `architecture.md.tpl` 由来、ori-c79.6 で tpl 廃止)
- [`packages/arch-adapters/eslint/`](../../packages/arch-adapters/eslint/) — adapter の仕様
- [`.apm/skills/ori-architect/architecture-md-schema.md`](../../.apm/skills/ori-architect/architecture-md-schema.md) — `.ori/architecture.md` のスキーマ
- [`docs/design.md`](../design.md) — 設計判断の背景 (§6 / §17 / §19 Phase H)
