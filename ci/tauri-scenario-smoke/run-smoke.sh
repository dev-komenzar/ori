#!/usr/bin/env bash
# ori tauri scenario CI smoke — local (tauri) scenario の WDIO 実行の実在性ガード (ori-7c1)
#
# What this driver IS:
#   - 最小 tauri v2 fixture app を build-then-test でビルド (`pnpm tauri build --debug --no-bundle`)
#   - ori-generate SKILL.md の wdio.conf.ts / tsconfig.json template をそのまま抽出して使う
#     (決定的 generate leg。template が実 API とずれたら CI が落ちる)
#   - scenario tsconfig で `tsc --noEmit` (review phase の型検証相当)
#   - :4444 占有時に onPrepare が SevereServiceError で fail fast すること (ori-oan.10)
#   - `env -u LD_LIBRARY_PATH xvfb-run` で WDIO → tauri-driver → WebKitWebDriver → binary が
#     GREEN (window text + XDG storage 隔離) であることを assert
#   - TS 版 ci/scenario-smoke (compose-service + playwright) と対になる tauri 版
#
# What this driver is NOT:
#   - /ori-flow の LLM-driven phase (derive / generate / review) — session acceptance 側で検証
#   - tauri-plugin-wdio 配線 (G1 patch) と plugin 警告 0 の判定 — frontend 側の
#     @wdio/tauri-plugin import に bundler が要るため fixture は static html に留める
#
# 前提ツール: node / pnpm / cargo / tauri-driver / WebKitWebDriver / xvfb-run
# (ci/tauri-scenario-smoke/Dockerfile が全部入りの image を提供する)
#
# Usage:
#   bash ci/tauri-scenario-smoke/run-smoke.sh
#   ORI_SMOKE_WORK=/path bash ci/tauri-scenario-smoke/run-smoke.sh
#   ORI_SMOKE_CARGO_TARGET=/cache/target bash ci/tauri-scenario-smoke/run-smoke.sh  # cargo target を work 外に保持 (CI cache)
#   ORI_SMOKE_ARTIFACTS=/out bash ci/tauri-scenario-smoke/run-smoke.sh              # screenshot / log の出力先
#
# Exit codes:
#   0  all assertions passed
#   1  an assertion failed
#   2  prerequisite tool missing
set -euo pipefail

# ----- locate ori bundle (this repo) -----------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORI_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GENERATE_SKILL="$ORI_ROOT/.apm/skills/ori-generate/SKILL.md"

WORK="${ORI_SMOKE_WORK:-/tmp/ori-tauri-scenario-smoke}"
APP=myapp
SCENARIO_ID="tauri-smoke-e2e"
APP_DIR="$WORK/apps/$APP"
SCENARIO_DIR="$WORK/.ori/scenarios/$SCENARIO_ID"
BINARY="$APP_DIR/src-tauri/target/debug/$APP"
ARTIFACTS="${ORI_SMOKE_ARTIFACTS:-$WORK/artifacts}"
DRIVER_PORT=4444

# ----- helpers ----------------------------------------------------------------
log()  { printf '\033[1;34m[tauri-scenario-smoke]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  PASS\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m  FAIL\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found on PATH" >&2; exit 2; }
}

assert_file() {
  [[ -f "$1" ]] || fail "expected file missing: $1"
  ok "$1 present"
}

port_in_use() {
  node -e "const s=require('net').createConnection({port:$1,host:'127.0.0.1'});s.setTimeout(1000,()=>{s.destroy();process.exit(1)});s.once('connect',()=>{s.destroy();process.exit(0)});s.once('error',()=>process.exit(1))"
}

for c in node pnpm cargo tauri-driver WebKitWebDriver xvfb-run; do require_cmd "$c"; done
port_in_use "$DRIVER_PORT" && { echo "ERROR: :$DRIVER_PORT が使用中 (残留 tauri-driver? pkill tauri-driver で解放)" >&2; exit 2; }

# ----- 1. work dir scaffold (greenfield 相当) --------------------------------
log "scaffold work dir: $WORK"
rm -rf "$WORK"
mkdir -p "$WORK/apps" "$SCENARIO_DIR" "$ARTIFACTS"
cp -R "$SCRIPT_DIR/fixtures/$APP" "$APP_DIR"
rm -rf "$APP_DIR/node_modules" "$APP_DIR/src-tauri/target"
if [[ -n "${ORI_SMOKE_CARGO_TARGET:-}" ]]; then
  mkdir -p "$ORI_SMOKE_CARGO_TARGET"
  ln -s "$ORI_SMOKE_CARGO_TARGET" "$APP_DIR/src-tauri/target"
  ok "cargo target → $ORI_SMOKE_CARGO_TARGET"
fi
cp -R "$SCRIPT_DIR/scenario/tests" "$SCENARIO_DIR/tests"

# ----- 2. runner config (SKILL template の決定的 generate leg) ------------------
log "extract wdio.conf.ts / tsconfig.json from ori-generate SKILL.md"
node "$SCRIPT_DIR/extract-wdio-template.mjs" "$GENERATE_SKILL" "$SCENARIO_DIR" "$APP" "$SCENARIO_ID" \
  || fail "SKILL.md の wdio template を抽出できない"
assert_file "$SCENARIO_DIR/wdio.conf.ts"
assert_file "$SCENARIO_DIR/tsconfig.json"
grep -qF "apps/$APP" "$SCENARIO_DIR/wdio.conf.ts" || fail "wdio.conf.ts: <app> が置換されていない"
ok "wdio.conf.ts: APP_DIR / BINARY が apps/$APP を指す"

# G3: generate の app 前提 patch 1 と同じ symlink (tsc が onPrepare 前に型を解決できるように)
ln -s "../../apps/$APP/node_modules" "$WORK/.ori/scenarios/node_modules"

# ----- 3. install + tsc (review phase の型検証相当) ------------------------------
log "pnpm install (fixture app: tauri-cli + runner deps)"
( cd "$APP_DIR" && pnpm install --ignore-workspace --frozen-lockfile ) || fail "pnpm install failed"

log "tsc --noEmit (scenario tsconfig)"
"$APP_DIR/node_modules/.bin/tsc" -p "$SCENARIO_DIR" --noEmit \
  || fail "scenario の tsc --noEmit が通らない (SKILL template の型 / tsconfig が runner deps とずれている)"
ok "tsc --noEmit exit 0"

# ----- 4. build-then-test --------------------------------------------------------
log "pnpm tauri build --debug --no-bundle"
( cd "$APP_DIR" && pnpm tauri build --debug --no-bundle ) || fail "tauri build failed"
[[ -x "$BINARY" ]] || fail "runtime.binary が生成されていない: $BINARY"
ok "binary built: $BINARY"

WDIO=("$APP_DIR/node_modules/.bin/wdio" run "$SCENARIO_DIR/wdio.conf.ts")

# ----- 5. :4444 占有時の fail fast (ori-oan.10) -----------------------------------
log "onPrepare fail fast: :$DRIVER_PORT を占有した状態で wdio を起動"
node -e "require('net').createServer().listen($DRIVER_PORT,'127.0.0.1')" &
BLOCKER=$!
trap 'kill $BLOCKER 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do port_in_use "$DRIVER_PORT" && break; sleep 0.25; done
set +e
( cd "$SCENARIO_DIR" && timeout 120 env -u LD_LIBRARY_PATH xvfb-run -a "${WDIO[@]}" ) > "$ARTIFACTS/wdio-port-busy.log" 2>&1
rc=$?
set -e
kill "$BLOCKER" 2>/dev/null || true
wait "$BLOCKER" 2>/dev/null || true
trap - EXIT
[[ "$rc" != "0" ]] || { cat "$ARTIFACTS/wdio-port-busy.log"; fail ":$DRIVER_PORT 占有中なのに wdio が exit 0 (onPrepare が止めていない)"; }
[[ "$rc" != "124" ]] || { cat "$ARTIFACTS/wdio-port-busy.log"; fail ":$DRIVER_PORT 占有中に wdio が timeout (fail fast していない)"; }
grep -qF "残留 tauri-driver" "$ARTIFACTS/wdio-port-busy.log" \
  || { cat "$ARTIFACTS/wdio-port-busy.log"; fail "fail fast の原因メッセージ (残留 tauri-driver) が出ていない"; }
ok "onPrepare が :$DRIVER_PORT 占有を検出して停止 (exit $rc)"

# ----- 6. E2E (headless WDIO GREEN assert) ---------------------------------------
log "wdio run (env -u LD_LIBRARY_PATH xvfb-run)"
set +e
( cd "$SCENARIO_DIR" && ORI_SMOKE_ARTIFACTS="$ARTIFACTS" timeout 600 env -u LD_LIBRARY_PATH xvfb-run -a "${WDIO[@]}" ) 2>&1 \
  | tee "$ARTIFACTS/wdio.log"
rc=${PIPESTATUS[0]}
set -e
[[ "$rc" == "0" ]] || fail "wdio scenario not GREEN (exit $rc)。log: $ARTIFACTS/wdio.log"
grep -qE "2 passing" "$ARTIFACTS/wdio.log" || fail "wdio log に '2 passing' が無い"
ok "wdio scenario GREEN (2 passing)"
assert_file "$ARTIFACTS/tauri-window.png"

# ----- 7. teardown 検証 ------------------------------------------------------------
for _ in $(seq 1 20); do port_in_use "$DRIVER_PORT" || break; sleep 0.5; done
port_in_use "$DRIVER_PORT" && fail "wdio 終了後も :$DRIVER_PORT が占有されている (tauri-driver 残留)"
ok "tauri-driver は終了済み (:$DRIVER_PORT 解放)"
if compgen -G "${TMPDIR:-/tmp}/ori-scenario-$SCENARIO_ID-*" >/dev/null; then
  fail "onComplete が per-run temp root を削除していない"
fi
ok "per-run temp root は onComplete で削除済み"

log "ALL PASS — tauri scenario の WDIO 実行 (SKILL template → build → tauri-driver → WebKitWebDriver) は GREEN"
