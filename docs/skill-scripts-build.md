# skill scripts ビルド規約

`.apm/skills/<skill-name>/scripts/` に置くスクリプトには 2 種類ある。

## Pure bash で書ける I/O 系 → `scripts/*.sh` 直書き

ファイル読み書き・git 操作・外部コマンド呼び出しだけで完結する場合は、
シェルスクリプトを `.apm/skills/<skill-name>/scripts/<something>.sh` として直接作成する。
TypeScript ソースも esbuild も不要。

## JS が必要な場合 → `packages/skills/<name>/src/index.ts` を書いて esbuild bundle

JSON/YAML 解析・型安全なロジック・ワークスペースパッケージ (`@ori-ori/parser` 等) の利用が
必要な場合は TypeScript で実装し、esbuild でバンドルする。

### ディレクトリ構成

```
packages/skills/<skill-name>/
  package.json        # name: @ori-ori/skill-<skill-name>, private: true
  tsconfig.json       # extends ../../../tsconfig.base.json
  src/
    index.ts          # エントリポイント
```

### bundle 出力

```
.apm/skills/<skill-name>/scripts/<skill-name>.js
```

- `<skill-name>` 先頭の `_` は出力ファイル名から除去する（例: `_hello` → `hello.js`）
- バンドルは ESM single-file (`--format=esm --bundle --platform=node --target=node20`)
- shebang `#!/usr/bin/env node` が先頭に付与される
- minify は行わない (`--minify=false`)

### ビルドコマンド

```bash
pnpm build:skills   # 全 skill を一括バンドル
```

内部では `scripts/build-skills.mjs` が esbuild JS API を呼び出す。

### 複数 skill で使う script

APM は skill folder を copytree するだけなので、SKILL.md から他 skill の `scripts/` は参照できない
(consumer では `.claude/skills/<name>/` 等に配置され `.apm/` が無い。symlink も git install では除外される)。
複数 skill で使う script は `scripts/build-skills.mjs` の `SHARED_ENTRIES` に宣言し、各 skill の `scripts/` へ複製する。

- `entry` だけなら `packages/skills-shared/src/<entry>` を source にする
- `src` を指定すると既存の source (例: `packages/skills/ori-flow/src/scenario-status.ts`) をそのまま使う。持ち主 skill へは通常どおり出力され、`skills` には複製先だけを書く
- `.sh` は build せずに複製する (実行権限付き)
- `assets` は script が自分の位置から読むファイル (例: `new-scenario.js` が読む `templates/scenario-manifest.yaml.tpl`)。持ち主 skill から同じ相対 path へ複製する

SKILL.md では `node scripts/<x>.js` と skill root 相対で書く。実行時の cwd は project root が前提。ori-flow の script と `testids.js` は上方探索で `.ori/` を持つ project root を解決するので、サブ dir から実行してもよい。
`packages/skills-shared/tests/skill-references.test.ts` が、SKILL.md の案内する `scripts/<x>` が自 skill に存在することを検査する。

### CI stale check

PR マージ前に `.apm/skills/*/scripts/` の更新漏れを自動検出する。
`.github/workflows/build-skills-check.yml` が `pnpm build && git diff --exit-code` を実行し
(対象: `.apm/skills/*/{scripts,adapters,templates}/`、untracked の生成物も検出)、
bundle を更新せずにソースだけ変更した PR は CI で落ちる。

### Node.js バージョン前提

Node.js >= 20 が必要。`engines.node` は `">=20"` を指定すること。
