# Serena MCP LSP 起動失敗の調査結果 (2026-08-12)

## 対象プロジェクト
- プロジェクト: `/home/takuya/ghq/github.com/dev-komenzar/ori`
- Serena: v1.7.0 (NixOS package `python3.14-serena-agent-1.7.0`)
- Goose Desktop: v1.45.0 (NixOS package `goose-desktop-1.45.0`)

## 現象
- Serena MCP の LSP 依存ツール (`find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `get_diagnostics_for_file` 等) がすべて失敗
- エラー: `LanguageServerTerminatedException: Language server stdout read process terminated unexpectedly`
- 言語サーバーが 0.4 秒でクラッシュする
- 非 LSP ツール (`search_for_pattern`, `replace_content`, `read_memory` 等) は正常動作

## 根本原因: Goose の node ラッパー → Hermit ブロックループ

### 連鎖の流れ

1. **Goose が `node` をラップしている**
   - パス: `/nix/store/mkrqlrc5srz823h4vbp2k4x88hqah8bh-goose-desktop-1.45.0/lib/goose/resources/bin/node`
   - 正体: bash スクリプト → `node-setup-common.sh` を source → Hermit セットアップ後に実際の node を実行

2. **`hermit env` コマンドが失敗する**
   - `node-setup-common.sh` 内の `activate_hermit_environment()`:
     ```bash
     if ! HERMIT_ENV=$(hermit env --shell=bash --activate 2>> "${LOG_FILE}"); then
         log "Hermit does not support bash activation. Updating hermit binary."
         download_hermit_binary
         HERMIT_ENV=$(hermit env --shell=bash --activate 2>> "${LOG_FILE}")
     fi
     ```
   - 1回目の `hermit env` が失敗 → `download_hermit_binary` 実行 → 2回目も同じエラーで失敗
   - `set -euo pipefail` により、2回目の失敗で **スクリプト全体が即座に終了**
   - エラーメッセージ: `hermit: error: unexpected argument env`

3. **`hermit env` が失敗する理由**
   - Hermit は環境コマンド (`env`, `status`, `install` 等) を `hermit init` 完了ディレクトリでのみ有効にする
   - 初回起動時のログ (mcp_20260812-175645_3637862.txt) より:
     - Goose の one-time cleanup (`mcp-hermit-cleanup-v1`) が既存 mcp-hermit ディレクトリを削除
     - `hermit init` 実行 → しかし `text file busy` エラーで失敗 (Hermit 自己更新ロック問題)
     - ルートの `hermit.hcl` が作成されないまま、`bin/activate-hermit` だけが作成される
   - 2回目以降は `bin/activate-hermit` 存在により「already initialized」と判定され `hermit init` がスキップ
   - しかし `hermit.hcl` が不完全なため、`hermit env` は環境コマンドとして認識されない

4. **TypeScript Language Server が起動しない**
   - Serena → `typescript-language-server --stdio` 起動
   - shebang: `#!/usr/bin/env node`
   - Goose の `node` ラッパーが Hermit セットアップ中にクラッシュ → プロセス即座に終了

### 再現確認

#### ログ (/tmp/mcp.log)
```
2026-08-12 18:12:24 - Activating hermit environment.
hermit: error: unexpected argument env
2026-08-12 18:12:24 - Hermit does not support bash activation. Updating hermit binary.
hermit: error: unexpected argument env
# ← ここでスクリプトが終了、node は実行されない
```

#### Serena ログ (~/.serena/logs/2026-08-12/)
- 17:56:45 — 初回: hermit init 失敗 (text file busy) → `hermit env` 失敗 → LS クラッシュ
- 18:10:22 — 2回目: "already initialized" で init スキップ → `hermit env` 失敗 → LS クラッシュ

### `hermit init` の失敗原因
- Hermit の自己更新ロック機能が、実行中の hermit binary 自体をロック
- `hermit init` は `/home/takuya/.config/goose/mcp-hermit/bin/hermit` を書き換えようとするが、自身がその binary から起動しているため `text file busy`
- node-setup-common.sh の Linux 向け workaround (temp dir に copy して実行) があるが、これでも完全には回避できていない

## 関連ファイル
- `~/.serena/serena_config.yml` — Serena グローバル設定 (language_backend: LSP)
- `~/.serena/logs/2026-08-12/mcp_*.txt` — Serena ログ
- `~/.serena/language_servers/static/TypeScriptLanguageServer/ts-lsp/` — Serena がダウンロードした TS LS
- `~/.config/goose/mcp-hermit/` — Goose の Hermit 環境
- `~/.config/goose/mcp-hermit/hermit.hcl` — **存在しない** (本来あるべき)
- `~/.config/goose/mcp-hermit/bin/hermit.hcl` — 存在 (中身: `github-token-auth {}`)
- `~/.config/goose/.mcp-hermit-cleanup-v1` — cleanup marker (存在)
- `/nix/store/.../goose-desktop-1.45.0/lib/goose/resources/bin/node` — node ラッパー
- `/nix/store/.../goose-desktop-1.45.0/lib/goose/resources/bin/node-setup-common.sh` — 共通セットアップ
- Species: `oriproject/.serena/project.yml` — language: typescript

## 回避策 (未実施)

### A. Hermit 環境の手動修復 (即効)
```bash
# 1. text file busy を回避するため、別ディレクトリから hermit を copy して init
HERMIT_TMP=$(mktemp -d)
cp ~/.config/goose/mcp-hermit/bin/hermit "$HERMIT_TMP/hermit"
chmod +x "$HERMIT_TMP/hermit"
cd ~/.config/goose/mcp-hermit
"$HERMIT_TMP/hermit" init
# → hermit.hcl が作成されることを確認
rm -rf "$HERMIT_TMP"
```

### B. node-setup-common.sh の修正 (Goose 側)
- `hermit env` 失敗時の 2回目で `set -e` によりクラッシュしないよう `|| true` 等で fallback
- `hermit init` の `text file busy` を確実に回避

### C. Goose 以外の node を使う
- Serena MCP サーバー起動前に `PATH` を調整し、システムの node を優先
- 例: MCP 設定で `env: { PATH: "/run/current-system/sw/bin:..." }` を指定

## 今後の作業
- dotfiles 側で回避策 A または C を実装・検証
- Goose upstream に B の修正を報告するか検討