---
name: ori-arch
description: pattern (DDD-VSA-Hex 等) と framework (Vite / Vite+Tauri 等) を決定し、対応する template を cwd へ scaffold する。`ori init` の next step。
---

`ori init` で `.ori/` skeleton が作られた後の **次のステップ**。pattern / framework を対話で決め、
`packages/templates/<derived-name>/` の中身を cwd に copy します。

## 設計原則 — 「decide → copy」二段構え

このスキルの責務は 2 つだけ:

1. **decide**：ユーザに pattern / framework を聞き、対応する template name を導出する
2. **copy**：`scripts/copy-template.sh` を呼んで template を cwd に展開する

ロジック（pattern / framework のマトリクス、template の中身）はスクリプト側 / template 側に閉じる。
SKILL.md は「対話 → スクリプト引数」変換のみ。

## 手順

1. **前提確認**：
   - `ls .ori/config.yaml` が存在することを確認。なければ `/ori-init` を先に実行するよう案内
   - `apps/` 配下に既存の app があるか確認（あれば overwrite するか聞く）

2. **pattern を選んでもらう**：
   - **ddd-vsa-hex** (default)：DDD 文脈、Vertical Slice Architecture、Hexagonal port-adapter
   - 将来：`hex` / `layered` などを追加予定（現状は ddd-vsa-hex のみ実装）

3. **framework を選んでもらう**：
   - **typescript** (default)：Vite/Node 等で動く pure TypeScript scaffold
   - **typescript-tauri**：上記 + Tauri v2 (Rust 側 IPC bindings 付き)

4. **template name を導出する**：
   - `ddd-vsa-hex` + `typescript`      → `ddd-vsa-hex-typescript`
   - `ddd-vsa-hex` + `typescript-tauri` → `ddd-vsa-hex-typescript-tauri`
   - 該当組合せが無ければユーザに警告し中断

5. **app name を決定する**：
   - `.ori/config.yaml` の `workspace.apps[0].name` を読む（`ori init` が cwd basename から sanitize して書く）
   - 取れなければ cwd basename を sanitize（`scripts/copy-template.sh` 内で自動 fallback）

6. **template を copy**：
   ```bash
   bash scripts/copy-template.sh --template <derived-name>
   ```
   既存ファイルを上書きしたい場合のみ `--force` を付ける。

7. **次ステップ提示**：
   - `pnpm install`
   - `pnpm test`（template 同梱の sample test が PASS することを確認）
   - 最初の slice を作るなら `ori slice new <id>` → `/ori-flow <id>`

## 注意

- **scaffold は idempotent ではない**：既存ファイルは default で skip (`--force` で上書き)。
- **.ori/ skeleton は壊さない**：template に含まれる `.ori/architecture.md` のみ書く（ori init が作る `.ori/config.yaml` 等とは衝突しない）。
- **template の置き場所**：scripts は次の順で探索する：
  1. `--templates-dir <dir>` 引数
  2. `$ORI_TEMPLATES_DIR` 環境変数
  3. skill 同梱 (`<skill>/templates/`)
  4. ori repo の dev path (`<repo>/packages/templates/`)
- **CLI 拡張は禁止**（`ori-execution-model-shift-2026-06-03`）：新機能はこのスキル + scripts/ で実装する

## Architecture Export / Check スクリプト

`scripts/` 配下の JS スクリプトで `.ori/architecture.md` を adapter 経由でコンパイル・検証できます：

```bash
# eslint.config.js を生成
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint

# Rust 向け arch test を生成
node .apm/skills/ori-arch/scripts/export.js --adapter=rust --root=rs

# dry-run（ファイル出力なし）
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint --dry-run

# adapter の native linter で違反チェック
node .apm/skills/ori-arch/scripts/check.js --adapter=eslint

# ui-fields から ## Page Map セクションを自動更新
node .apm/skills/ori-arch/scripts/sync-page-map.js

# dry-run
node .apm/skills/ori-arch/scripts/sync-page-map.js --dry-run
```

オプション（export / check 共通）：
- `--adapter=<name>` — adapter 指定（省略時は architecture.md の `adapter:` フィールドを使用）
- `--root=<id>` — multi-root 対象（省略時は `default_root`）
- `--spec=<path>` — spec ファイルパス（省略時: `.ori/architecture.md`）

## 次のアクション

`/ori-arch` 完了後、ユーザに以下を提示：

- **動作確認パス**：`pnpm install && pnpm test` で template の sample slice が動くこと確認
- **最初の slice 作成パス**：`/ori-flow new-slice <id>` で新 slice を scaffold → 7-phase 開発を回す
- **domain 起点で進めるパス**：`/ori-distill phase=discovery` で distill-ddd phase 1 から domain を立ち上げる
- **既存 domain がある場合のパス**：`/ori-migrate` で `docs/domain/` 等を `.ori/domain/` に昇格
