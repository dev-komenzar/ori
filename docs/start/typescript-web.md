# Start: TypeScript (web / Node)

`ddd-vsa-hex-typescript` テンプレートで、Web フロントエンド単体、または
Node 製サーバ単体のプロジェクトに ori の slice ベース DDD scaffold を
立ち上げます。Tauri を併用したい場合は [tauri-v2.md](./tauri-v2.md) を
参照。

## 1. 前提

| 要件     | バージョン  | 補足                                       |
| -------- | ----------- | ------------------------------------------ |
| Node     | >= 20       | `nvm` 推奨                                 |
| pnpm     | >= 9        | `corepack enable` で OK                    |
| ori CLI  | >= 0.0.1    | `npm i -g @ori-ori/cli`                    |
| APM      | latest      | AI 配布物（skill/agent/hook）の install に |

```bash
node --version       # v20.x or higher
pnpm --version       # 9.x or higher
ori --version
```

## 2. プロジェクト初期化

```bash
mkdir my-ts-app && cd my-ts-app
ori init --template ddd-vsa-hex-typescript
pnpm install
```

`ori init` が以下を生成します:

- `.ori/` — DDD ドキュメント置き場 + config + state
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`
- `.ori/architecture.md` — SSoT（後述）
- `apps/<app>/src/` — ddd-vsa-hex scaffold（worked example: `task-management/complete-task`）

> **Tip**: 既存プロジェクトに被せる場合は `ori init --template ddd-vsa-hex-typescript --force` 不要。既存ファイルは保護され、不足分だけ書き込まれます。

## 3. 生成された構造

```
apps/<app>/src/
├── task-management/                       # BC (slice_root)
│   ├── shared/                            # BC-internal shared (kind: shared)
│   │   ├── types/                         # Result, branded types
│   │   ├── events/                        # DomainEvent shape
│   │   └── contracts/                     # cross-slice ports (空)
│   └── slices/                            # slice_subdir = slices
│       └── complete-task/                 # 1 slice = 1 folder
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

主要ルール:

- **slice 公開面は `index.ts` のみ。** 他 slice からは `slices/<slice>/index.js` 経由でしか触れません
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
ori slice new switch-edit-target

# 7-phase TDD を走らせる
/ori-flow switch-edit-target
```

phase の中身は `packages/cli/src/commands/feature.ts` および
`packages/slice-runner/` を参照（slice/page CLI への rename は ori-0kw 待ち）。

## 5. アーキテクチャ lint の運用

`.ori/architecture.md` が編集されるたびに lint 設定を再生成します:

```bash
pnpm arch:export        # = ori arch export --adapter=eslint
pnpm lint               # eslint がルール違反を検出
```

`eslint.config.ori.js` は generated 物で `.gitignore` 済み。常に
architecture.md が source of truth です。CI では `pnpm arch:export &&
pnpm lint` を 1 セットで走らせます。

## 6. テスト

```bash
pnpm test               # vitest run
pnpm test:watch         # 開発中
pnpm typecheck          # tsc --noEmit
```

scaffold には:

- `apps/<app>/src/task-management/slices/complete-task/tests/task.test.ts` — domain unit specs
- `apps/<app>/src/__tests__/ui-flow.test.ts` — UI 2 層 + slice を貫通する e2e demo

が含まれます。自分の slice を足すたびに同じパターンで増やします。

## 7. よくある拡張

- **新しい domain slice** — `apps/<app>/src/<bc>/slices/<new-slice>/index.ts` + 配下の sub-layer を追加
- **新しい UI 層**（例: `ui-shell`） — `.ori/architecture.md` の `layers` と `rules.cross_layer` に追加 → `pnpm arch:export`
- **cross-slice の連携** — まず `apps/<app>/src/<bc>/shared/contracts/<name>.ts` でポートを定義し、両 slice が contract に依存する形にする

## 関連リンク

- [`packages/templates/ddd-vsa-hex-typescript/README.md`](../../packages/templates/ddd-vsa-hex-typescript/README.md) — テンプレート本体の詳細
- [`packages/arch-adapter-eslint/README.md`](../../packages/arch-adapter-eslint/README.md) — adapter の仕様
- [`.apm/contexts/architecture-md-schema.md`](../../.apm/contexts/architecture-md-schema.md) — `.ori/architecture.md` のスキーマ
- [`docs/design.md`](../design.md) — 設計判断の背景
