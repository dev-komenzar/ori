# Skill Scripts — 開発ガイド

## 環境別のパス解決

skill scripts には 2 つの実行環境がある。

| 環境 | `.apm/skills/` の場所 | 更新方法 |
|---|---|---|
| **APM-install** (`apm install ori`) | `~/.apm/packages/ori/.apm/skills/` | `apm update ori` でパッケージ更新 |
| **dev 環境** (このリポジトリ) | `<repo-root>/.apm/skills/` | `pnpm build:skills` で手動再ビルド or pre-commit hook が自動実行 |

dev 環境では `.apm/skills/` はリポジトリ内に存在し git 管理下に置かれる。
APM-install 環境では APM がスナップショットをグローバルにキャッシュするため、ソース変更後に `apm update` が必要。

## 新規 skill の追加手順

### 1. `packages/skills/<skill-name>/` エントリを作成

```bash
mkdir -p packages/skills/<skill-name>/src
```

`package.json`:
```json
{
  "name": "@ori-ori/skill-<skill-name>",
  "version": "0.0.1",
  "private": true,
  "type": "module"
}
```

`tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`src/index.ts` — エントリポイント（`console.log` から始めてよい）。

### 2. esbuild config へ自動登録

`scripts/build-skills.mjs` は `packages/skills/` を動的スキャンするため、
ディレクトリを作成するだけで次回 `pnpm build:skills` から対象に含まれる。
追加設定は不要。

### 3. SKILL.md を作成

```bash
cat > .apm/skills/<skill-name>/SKILL.md << 'EOF'
---
name: <skill-name>
description: <一行説明>
---

## 手順

...
EOF
```

SKILL.md は Claude Code の skill registry が読み込む定義ファイル。
ロードタイミングは session 開始時なので、変更後は新規 session を開くか
`/project:reload` で registry を更新すること（`skill-registry-load-timing-2026-06-03` 参照）。

### 4. ビルドして確認

```bash
pnpm build:skills
# → .apm/skills/<skill-name>/scripts/index.js が出力される
node .apm/skills/<skill-name>/scripts/index.js
```

### 5. コミット時の注意

`packages/skills/<skill-name>/src/` を変更した場合、pre-commit hook が
自動的に `pnpm build:skills` を実行し bundle を更新して staging に追加する。
**ソースと bundle を別コミットに分ける必要はない。**

## bundle stale の回復手順

CI で以下のエラーが出た場合:

```
Fail if bundled scripts are stale
```

bundle の更新が漏れている。以下で回復する:

```bash
pnpm build:skills
git add .apm/skills/*/scripts/
git commit --amend --no-edit   # または新規コミット
git push --force-with-lease    # amend した場合
```

または単純に新規コミットを追加:

```bash
pnpm build:skills
git add .apm/skills/*/scripts/
git commit -m "chore: rebuild skill bundles"
```

## Watch モード（開発中）

skill src を変更しながら bundle の出力を確認したい場合:

```bash
pnpm dev:skills
```

esbuild の watch モードで `packages/skills/**/src/` の変更を検知して自動再ビルドする。
pre-commit hook の代わりに開発中は watch モードを活用すると DX が向上する。

## skill registry のリロード

Claude Code は session 開始時に `.apm/skills/` を scan して skill registry を構築する。
bundle を更新しても **既存 session には反映されない**。

- **新規 session** を開く（確実）
- `/project:reload` コマンドを実行（session 内でリロード可能な場合）
