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

### CI stale check

PR マージ前に `.apm/skills/*/scripts/` の更新漏れを自動検出する。
`.github/workflows/build-skills-check.yml` が `pnpm build:skills && git diff --exit-code` を実行し、
bundle を更新せずにソースだけ変更した PR は CI で落ちる。

### Node.js バージョン前提

Node.js >= 20 が必要。`engines.node` は `">=20"` を指定すること。
