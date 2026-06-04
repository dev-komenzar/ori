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
| APM      | latest      | `apm install dev-komenzar/ori`             |

```bash
node --version       # v20.x or higher
pnpm --version       # 9.x or higher
```

## 2. プロジェクト初期化

```bash
mkdir my-ts-app && cd my-ts-app
/ori-init               # .ori/ skeleton + config.yaml 生成 (silent)
/ori-arch               # pattern/framework 決定 → template scaffold
pnpm install
```

役割分担:

- `/ori-init` （ステップ 1） — **silent**。`.ori/` skeleton と
  `.ori/config.yaml`、domain scaffold seed のみ生成。プロジェクトルートには
  `package.json` 等を書かない。
- `/ori-arch` （ステップ 2） — pattern (`ddd-vsa-hex`) / framework
  (`typescript`) を対話で決め、対応する template（ここでは
  `ddd-vsa-hex-typescript`）を cwd に展開。`package.json`,
  `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`,
  `.ori/architecture.md`, `apps/<app>/src/`（worked example:
  `task-management/complete-task`）がここで揃う。

`/ori-arch` の template copy は **既存ファイルを保護**します（上書きしたい
場合のみ `--force` を skill 内で指示）。`apps/template-app/` は
`.ori/config.yaml` の `workspace.apps[0].name` （cwd basename を sanitize した
もの）に rename されます。

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
node .apm/skills/ori-flow/scripts/new-slice.js switch-edit-target

# 7-phase TDD を走らせる
/ori-flow switch-edit-target
```

phase の中身は `packages/cli/src/commands/feature.ts` および
`packages/slice-runner/` を参照（slice/page CLI への rename は ori-0kw 待ち）。

## 5. アーキテクチャ lint の運用

`.ori/architecture.md` が編集されるたびに lint 設定を再生成します:

```bash
pnpm arch:export        # = node .apm/skills/ori-arch/scripts/export.js --adapter=eslint
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
