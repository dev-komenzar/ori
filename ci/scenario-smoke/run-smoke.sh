#!/usr/bin/env bash
# ori scenario CI smoke — scenario 実行モデル descriptor の実在性ガード (ori-bc9.5 / D7)
#
# What this driver IS:
#   - golden fixture (typescript) の runtime block + infra catalog から
#     generate-docker-compose.sh で docker-compose.yml を生成 (決定的 generate leg)
#   - docker compose up --wait で app + postgres を起動 (descriptor 実在性 leg)
#   - headless playwright (chromium) で app endpoint が GREEN であることを assert
#   - unit test は生成物の「形状」のみ検証するため、この smoke が
#     「descriptor が実際に起動するか」を毎 PR でガードする
#
# What this driver is NOT:
#   - /ori-flow の LLM-driven phase (derive / review) — session acceptance 側で検証
#
# Usage:
#   bash ci/scenario-smoke/run-smoke.sh
#   ORI_SMOKE_WORK=/path bash ci/scenario-smoke/run-smoke.sh
#   ORI_SMOKE_SKIP_COMPOSE=1 bash ci/scenario-smoke/run-smoke.sh   # 生成 + config -q のみ
#
# Exit codes:
#   0  all assertions passed
#   1  an assertion failed
#   2  prerequisite tool missing (node / bash / docker+compose when not skipped)
set -euo pipefail

# ----- locate ori bundle (this repo) -----------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORI_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_DIR="$ORI_ROOT/.apm/skills"
GOLDEN_TS_FIXTURE="$ORI_ROOT/packages/skills/ori-arch/tests/fixtures/agent-generated/typescript/architecture.md"

WORK="${ORI_SMOKE_WORK:-/tmp/ori-scenario-smoke}"
SCENARIO_ID="scenario-smoke-e2e"
SCENARIO_DIR="$WORK/.ori/scenarios/$SCENARIO_ID"
COMPOSE_FILE="$SCENARIO_DIR/docker-compose.yml"

# ----- helpers ----------------------------------------------------------------
log()  { printf '\033[1;34m[scenario-smoke]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  PASS\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m  FAIL\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found on PATH" >&2; exit 2; }
}

assert_file() {
  [[ -f "$1" ]] || fail "expected file missing: $1"
  ok "$1 present"
}

assert_contains() {
  local pattern="$1" file="$2" label="$3"
  grep -qF "$pattern" "$file" || fail "$label: '$pattern' not found in $file"
  ok "$label: $pattern"
}

require_cmd node
require_cmd bash
if [[ "${ORI_SMOKE_SKIP_COMPOSE:-0}" != "1" ]]; then
  require_cmd docker
  docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose unavailable" >&2; exit 2; }
fi

# ----- 1. work dir scaffold (greenfield 相当) --------------------------------
log "scaffold work dir: $WORK"
rm -rf "$WORK"
mkdir -p "$SCENARIO_DIR" "$WORK/.apm/skills/ori-generate/scripts" "$WORK/apps"

cp "$GOLDEN_TS_FIXTURE" "$WORK/.ori/architecture.md"
assert_file "$WORK/.ori/architecture.md"
grep -q "mode: compose-service" "$WORK/.ori/architecture.md" \
  || fail "golden fixture typescript/architecture.md に runtime block がない (fixture 更新漏れ)"
ok "golden fixture runtime block (compose-service) present"

cp -R "$ORI_ROOT/ci/scenario-smoke/fixtures/myapp" "$WORK/apps/myapp"
assert_file "$WORK/apps/myapp/server.mjs"

cp "$SKILLS_DIR"/ori-generate/scripts/* "$WORK/.apm/skills/ori-generate/scripts/"
assert_file "$WORK/.apm/skills/ori-generate/scripts/infra-catalog.yaml"

cat > "$SCENARIO_DIR/manifest.yaml" << EOF
scenario_id: $SCENARIO_ID
type: scenario
derives_from:
  - domain/workflows.md#smoke-workflow
infrastructure:
  services: [myapp, postgres]
EOF
assert_file "$SCENARIO_DIR/manifest.yaml"

# ----- 2. compose 生成 (決定的 generate leg) -----------------------------------
log "generate docker-compose.yml via generate-docker-compose.sh"
( cd "$WORK" && bash .apm/skills/ori-generate/scripts/generate-docker-compose.sh "$SCENARIO_ID" ) \
  || fail "generate-docker-compose.sh exited non-zero"
assert_file "$COMPOSE_FILE"

assert_contains "image: node:22-slim" "$COMPOSE_FILE" "app service image (runtime block)"
assert_contains "corepack enable" "$COMPOSE_FILE" "app install command (corepack 有効化)"
assert_contains "5173:5173" "$COMPOSE_FILE" "app ports (runtime.ports 静的宣言)"
assert_contains "../../../apps/myapp:/app" "$COMPOSE_FILE" "app volume (build-then-test source mount)"
assert_contains "image: postgres:16" "$COMPOSE_FILE" "infra service image (infra catalog)"
assert_contains "pg_isready" "$COMPOSE_FILE" "infra healthcheck (TCP probe の image family 翻訳)"

if [[ "${ORI_SMOKE_SKIP_COMPOSE:-0}" == "1" ]]; then
  log "ORI_SMOKE_SKIP_COMPOSE=1 — compose up / playwright legs skipped (generation + config 検証のみ)"
  exit 0
fi

# ----- 3. compose up (descriptor 実在性 leg) -----------------------------------
log "docker compose up --wait"
docker compose -f "$COMPOSE_FILE" up -d --wait \
  || fail "docker compose up --wait failed (runtime descriptor が起動しない)"

log "wait for app port 5173"
for i in $(seq 1 60); do
  if curl -sf --max-time 2 http://localhost:5173/ >/dev/null 2>&1; then
    ok "app responding on http://localhost:5173/"
    break
  fi
  if [[ "$i" == "60" ]]; then
    docker compose -f "$COMPOSE_FILE" logs myapp || true
    fail "app did not respond on :5173 within timeout"
  fi
  sleep 2
done

# ----- 4. headless playwright (GREEN assert) -----------------------------------
log "run headless playwright"
( cd "$ORI_ROOT/ci/scenario-smoke/playwright" \
  && pnpm install --ignore-workspace --frozen-lockfile \
  && pnpm exec playwright test ) \
  || { docker compose -f "$COMPOSE_FILE" logs myapp || true; fail "playwright smoke spec not GREEN"; }
ok "playwright smoke spec GREEN"

# ----- 5. teardown --------------------------------------------------------------
log "teardown"
docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

log "ALL PASS — scenario 実行モデル descriptor は起動した (generate → compose up → playwright GREEN)"
