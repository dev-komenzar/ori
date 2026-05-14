# Start: TypeScript (web / Node)

`ddd-typescript` テンプレートで、Web フロントエンド単体、または Node 製
サーバ単体のプロジェクトに ori の feature-sliced DDD scaffold を立ち上げ
ます。Tauri を併用したい場合は [tauri-v2.md](./tauri-v2.md) を参照。

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
ori init --template ddd-typescript
pnpm install
```

`ori init` が以下を生成します:

- `.ori/` — DDD ドキュメント置き場 + config + state
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`
- `.ori/architecture.md` — SSoT（後述）
- `src/` — feature-sliced scaffold（worked example: `tasks`）

> **Tip**: 既存プロジェクトに被せる場合は `ori init --template ddd-typescript --force` 不要。既存ファイルは保護され、不足分だけ書き込まれます。

## 3. 生成された構造

```
src/
├── lib/
│   ├── shared/                        # 全 feature の下位レイヤ
│   │   ├── types/                     # Result, branded types
│   │   ├── events/                    # DomainEvent shape
│   │   └── contracts/                 # cross-feature ports (空)
│   └── tasks/                         # 1 feature = 1 folder
│       ├── index.ts                   # ← 唯一の public API
│       ├── domain/                    # 純粋（aggregates, VOs, events）
│       ├── application/               # use-case 配線
│       ├── infrastructure/            # I/O adapters
│       ├── presentation/              # UI 境界
│       └── tests/
├── ui-entity/                         # FSD layer 1 — view models
├── ui-feature/                        # FSD layer 2 — ドメインを呼ぶ唯一の UI 層
├── ui-widget/                         # FSD layer 3 — 合成された UI block
├── ui-page/                           # FSD layer 4 — 画面
└── __tests__/
    └── ui-flow.test.ts                # page → widget → feature → domain
```

主要ルール:

- **feature 公開面は `index.ts` のみ。** 他 feature からは `lib/<feature>/index.js` 経由でしか触れません
- **UI 層は片方向**: `ui-page → ui-widget → ui-feature → ui-entity → shared`
- **`ui-feature` だけがドメインを import 可能**（他 UI 層は view-model を渡される側）
- **同層内の sibling import は禁止**（widget A → widget B など）

ルールはコードではなく `.ori/architecture.md` のフロントマターに宣言され、
`eslint-plugin-boundaries` 用の lint 設定に compile されます。

## 4. 最初の feature を派生する

```bash
# AI と対話して DDD phase 1-11 を進める（.ori/domain/ に成果物が落ちる）
/ori-distill

# 抽出された workflow から feature を切り出す
ori feature new switch-edit-target --type workflow

# 7-phase TDD を走らせる
/ori-flow switch-edit-target
```

phase の中身は `packages/cli/src/commands/feature.ts` および
`packages/feature-runner/` を参照。

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

- `src/lib/tasks/tests/task.test.ts` — domain unit specs
- `src/__tests__/ui-flow.test.ts` — UI 4 層を貫通する e2e demo

が含まれます。自分の feature を足すたびに同じパターンで増やします。

## 7. よくある拡張

- **新しい domain feature** — `src/lib/<new>/index.ts` + 配下の DDD レイヤを追加
- **新しい UI 層**（例: `ui-shell`） — `.ori/architecture.md` の `layers` と `rules.cross_layer` に追加 → `pnpm arch:export`
- **cross-feature の連携** — まず `src/lib/shared/contracts/<name>.ts` でポートを定義し、両 feature が contract に依存する形にする

## 関連リンク

- [`packages/templates/ddd-typescript/README.md`](../../packages/templates/ddd-typescript/README.md) — テンプレート本体の詳細
- [`packages/arch-adapter-eslint/README.md`](../../packages/arch-adapter-eslint/README.md) — adapter の仕様
- [`docs/architecture-schema.md`](../architecture-schema.md) — `.ori/architecture.md` のスキーマ
- [`docs/design.md`](../design.md) — 設計判断の背景
