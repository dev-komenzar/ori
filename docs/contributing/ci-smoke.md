# CI smoke (Slice DoD chain)

`/ori-flow` のうち **deterministic な script-level 部分** (`/ori-init` → `/ori-arch render` → `install-tauri-scaffold.sh` → `/ori-doctor sweep`) を fresh project 上で非対話駆動する smoke が `ci/smoke/` 配下にあります。

## 目的

skill が AI harness 経由で実行される一方、内部の bash/node script は deterministic に動くべきもの。これが壊れると利用者が最初の `/ori-init` で詰むため、**LLM を呼ばずに済む部分の回帰テスト**として CI で守ります。Slice DoD enforcement chain (`ori-fzr` epic) が skill 横断で動くことの最終保証点という位置付けです。

## カバー範囲

| 工程 | 確認内容 |
|---|---|
| `/ori-init` | `.ori/` skeleton 生成が動く |
| `/ori-arch render` | architecture.md → 各 adapter 設定の書き出し |
| `install-tauri-scaffold.sh` | `pnpm tauri init` 相当 + specta scaffold |
| `cargo check` (export-types) | Rust 側の最小コンパイル |
| `/ori-doctor sweep` | 空 slice manifest から `rule:dod-1` (sub_layers 未充填) を検出 |

## scope 外

LLM 駆動の phase (`/ori-test-red` / `/ori-impl-green` / `/ori-refactor` / `/ori-review`) は本 smoke の **scope 外** です。別途 manual / agent-driven smoke で確認します (ref: `docs/smoke-reports/ori-fzr-13.md`)。

## 構成

- **Dockerfile** (`ci/smoke/Dockerfile`) — node 22 + pnpm 10 + rust stable + tauri-cli 2 の base image
- **driver** (`ci/smoke/run-smoke.sh`) — skeleton 生成 → architecture render → minimal `pnpm tauri init` 相当 → specta scaffold → cargo check (export-types) → 空 slice manifest → `check-dod-sweep.sh` が `rule:dod-1` を検出することまでを assert
- **workflow** (`.github/workflows/dod-smoke.yml`) — main push / PR (関連 path 変更時) / `workflow_dispatch` で発火

## ローカル再現

```bash
docker build -t ori-smoke -f ci/smoke/Dockerfile ci/smoke
docker run --rm -v "$PWD":/workspace -w /workspace ori-smoke
# cargo check を skip したい場合: -e ORI_SMOKE_SKIP_CARGO=1
# 作業 dir を変えたい場合:        -e ORI_SMOKE_WORK=/tmp/foo
```
