#!/usr/bin/env bash
# ori CI smoke driver — non-interactive execution of the deterministic,
# script-level parts of `/ori-flow` on a freshly-scaffolded user project.
#
# Scope (what this driver IS):
#   - drives the bash/node scripts owned by /ori-init, /ori-arch, /ori-doctor
#     in the same sequence /ori-flow would (manifest scaffold → architecture
#     render → tauri scaffold → DoD sweep)
#   - asserts file outputs, sentinel substitution, and check-dod-sweep.sh
#     heuristics against a known empty slice
#   - runs `cargo check` on the tauri scaffold so the specta entry-point
#     template (export-types.rs.tpl) cannot regress on compilability
#
# Scope (what this driver is NOT):
#   - /ori-flow phases 3-6 (test-red / impl-green / refactor / review) are
#     LLM-driven judgment steps. They cannot be smoked without an LLM call,
#     so they are explicitly out-of-scope here. The deferred-phase tracking
#     lives in ori-fzr.16 / the smoke report at docs/smoke-reports/.
#
# Usage:
#   bash ci/smoke/run-smoke.sh                # defaults under /tmp
#   ORI_SMOKE_WORK=/path bash ci/smoke/run-smoke.sh
#   ORI_SMOKE_SKIP_CARGO=1 bash ci/smoke/run-smoke.sh   # skip cargo check
#
# Exit codes:
#   0  all assertions passed
#   1  an assertion failed (driver reports which step / what was missing)
#   2  prerequisite tool missing (node / pnpm / bash / sed / cargo when not skipped)
set -euo pipefail

# ----- locate ori bundle (this repo) ------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORI_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_DIR="$ORI_ROOT/.apm/skills"

WORK="${ORI_SMOKE_WORK:-/tmp/ori-smoke-work}"
APP_NAME="${ORI_SMOKE_APP:-notes}"
BC_NAME="${ORI_SMOKE_BC:-note-taking}"
SLICE_ID="${ORI_SMOKE_SLICE:-create-note}"

# ----- helpers ---------------------------------------------------------------
log()  { printf '\033[1;34m[smoke]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  PASS\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m  FAIL\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found on PATH" >&2; exit 2; }
}

assert_file() {
  [[ -f "$1" ]] || fail "expected file missing: $1"
  ok "$1 present"
}

assert_no_match() {
  local pattern="$1" file="$2"
  if grep -nE "$pattern" "$file" >/dev/null; then
    grep -nE "$pattern" "$file" >&2
    fail "unexpected pattern '$pattern' found in $file"
  fi
  ok "no '$pattern' leak in $file"
}

assert_grep() {
  local pattern="$1" file="$2"
  grep -qE "$pattern" "$file" || fail "expected pattern '$pattern' missing in $file"
  ok "'$pattern' present in $file"
}

# ----- prereqs ---------------------------------------------------------------
log "checking prerequisites"
require_cmd bash
require_cmd node
require_cmd pnpm
require_cmd sed
require_cmd grep
if [[ "${ORI_SMOKE_SKIP_CARGO:-0}" != "1" ]]; then
  require_cmd cargo
fi

# ----- fresh workspace -------------------------------------------------------
log "preparing fresh workspace at $WORK"
rm -rf "$WORK"
mkdir -p "$WORK"

# git is required by check-dod-sweep.sh's --project-root resolution path; the
# user project should normally be a git repo, so we mirror that here.
( cd "$WORK" && git init -q && git config user.email "smoke@example.com" \
                          && git config user.name  "smoke" )

# ----- step 1: /ori-init create-skeleton.sh ----------------------------------
log "step 1: create-skeleton.sh (/ori-init)"
bash "$SKILLS_DIR/ori-init/scripts/create-skeleton.sh" \
  --dest "$WORK" --app-name "$APP_NAME" --agent claude

assert_file "$WORK/.ori/config.yaml"
assert_file "$WORK/.ori/.gitignore"
assert_grep "current_agent: claude" "$WORK/.ori/config.yaml"
assert_grep "name: $APP_NAME" "$WORK/.ori/config.yaml"

# ----- step 2: /ori-arch render-architecture.js ------------------------------
log "step 2: render-architecture.js (/ori-arch render)"
( cd "$WORK" && node "$SKILLS_DIR/ori-arch/scripts/render-architecture.js" \
    --pattern ddd-vsa-hex --stack typescript-tauri --bc "$BC_NAME" )

ARCH="$WORK/.ori/architecture.md"
assert_file "$ARCH"
# ori-fzr.2 / ori-fzr.11 outputs that downstream sweep depends on:
assert_grep "cross_root:"   "$ARCH"
assert_grep "sub_layers:"   "$ARCH"
assert_grep "phase_hooks:"  "$ARCH"

# ----- step 3: simulate `pnpm tauri init` -----------------------------------
# A real `pnpm tauri init` is interactive (asks for app name / window title /
# frontend dist / dev URL). The smallest scaffold that satisfies
# install-tauri-scaffold.sh's pre-checks AND lets cargo check compile the
# specta entry is a minimal Cargo.toml + lib.rs + main.rs.
log "step 3: simulate pnpm tauri init (minimal Cargo skeleton)"
APP_DIR="$WORK/apps/$APP_NAME"
ST_DIR="$APP_DIR/src-tauri"
mkdir -p "$ST_DIR/src/bin" "$APP_DIR/src"

cat > "$ST_DIR/Cargo.toml" <<EOF
[package]
name = "${APP_NAME//-/_}"
version = "0.0.0"
edition = "2021"

[lib]
name = "${APP_NAME//-/_}"
crate-type = ["lib"]
path = "src/lib.rs"

[[bin]]
name = "${APP_NAME//-/_}"
path = "src/main.rs"

[[bin]]
name = "export-types"
path = "src/bin/export-types.rs"
EOF

cat > "$ST_DIR/src/lib.rs" <<'EOF'
// minimal lib for smoke
pub fn run() {}
EOF

cat > "$ST_DIR/src/main.rs" <<'EOF'
fn main() {}
EOF

# ----- step 4: install-tauri-scaffold.sh -------------------------------------
log "step 4: install-tauri-scaffold.sh (/ori-arch install scaffold)"
bash "$SKILLS_DIR/ori-init/scripts/install-tauri-scaffold.sh" \
  --dest "$WORK" --app-name "$APP_NAME" --bc-name "$BC_NAME"

EXPORT_RS="$ST_DIR/src/bin/export-types.rs"
SPECTA_SH="$WORK/apm-scripts/specta-build.sh"
FIXTURE_TS="$APP_DIR/src/$BC_NAME/shared/test-fixtures/setupProductionBuilder.ts"
IPC_KEEP="$APP_DIR/src/$BC_NAME/shared/ipc/.gitkeep"

assert_file "$EXPORT_RS"
assert_file "$SPECTA_SH"
assert_file "$FIXTURE_TS"
assert_file "$IPC_KEEP"

# ori-fzr.14 regression guard: no jinja-style sentinel leak.
assert_no_match '\{\{[A-Z_]+\}\}' "$EXPORT_RS"
# ori-init sed sentinels must all be substituted.
assert_no_match '__BC_NAME__|__APP_NAME__|__BC_NAME_RS__|__APP_NAME_RS__' "$EXPORT_RS"
assert_no_match '__BC_NAME__|__APP_NAME__|__BC_NAME_RS__|__APP_NAME_RS__' "$FIXTURE_TS"
assert_no_match '__BC_NAME__|__APP_NAME__|__BC_NAME_RS__|__APP_NAME_RS__' "$SPECTA_SH"

# Substitution sanity (positive): BC_NAME should appear in export-types output path.
assert_grep "src/$BC_NAME/shared/ipc/bindings.ts" "$EXPORT_RS"

# ----- step 5: cargo check on the scaffold -----------------------------------
# Validates that export-types.rs.tpl produces compilable Rust after sed and
# that Cargo.toml deps wiring works against the live crates.io index. This
# is the cargo-side coverage that ori-fzr.13 had to defer.
if [[ "${ORI_SMOKE_SKIP_CARGO:-0}" == "1" ]]; then
  log "step 5: cargo check (SKIPPED via ORI_SMOKE_SKIP_CARGO=1)"
else
  log "step 5: cargo check (compile the specta scaffold)"
  ( cd "$ST_DIR" && cargo check --bin export-types --quiet ) \
    || fail "cargo check failed on $EXPORT_RS — specta scaffold no longer compiles"
  ok "cargo check passed for export-types"
fi

# ----- step 6: sample slice manifest (mirrors ori-fzr.4 schema) --------------
log "step 6: write empty slice manifest for $SLICE_ID"
SLICE_DIR="$WORK/.ori/slices/$SLICE_ID"
mkdir -p "$SLICE_DIR"
cat > "$SLICE_DIR/manifest.yaml" <<EOF
ori:
  node_id: slice:$SLICE_ID
  type: slice
  version: 1.0.0
id: $SLICE_ID
bc: $BC_NAME
app: $APP_NAME
expected_deliverables:
  sub_layers:
    - domain
    - application
    - infrastructure
    - presentation
    - tests
  boundary:
    bindings: src/$BC_NAME/shared/ipc/bindings.ts
  production_fixture:
    helper: src/$BC_NAME/shared/test-fixtures/setupProductionBuilder.ts
  cross_root_contracts:
    rust_commands: src-tauri/src/lib.rs
    ts_bindings:   src/$BC_NAME/shared/ipc/bindings.ts
EOF
assert_file "$SLICE_DIR/manifest.yaml"

# ----- step 7: check-dod-sweep.sh against an empty slice ---------------------
# Expectation: an empty slice (no sub-layer files written yet) must trip the
# rule:dod-1 heuristic. Exit code 1 = violations detected.
log "step 7: check-dod-sweep.sh (--project-root) — expect violations on empty slice"
set +e
SWEEP_OUT="$(bash "$SKILLS_DIR/ori-doctor/scripts/check-dod-sweep.sh" \
  --project-root "$WORK" 2>&1)"
SWEEP_EXIT=$?
set -e

echo "$SWEEP_OUT" | sed 's/^/    | /'

if [[ "$SWEEP_EXIT" -ne 1 ]]; then
  fail "check-dod-sweep.sh exited $SWEEP_EXIT (expected 1 = violations detected on empty slice)"
fi
echo "$SWEEP_OUT" | grep -q "rule:dod-1" \
  || fail "check-dod-sweep.sh did not report rule:dod-1 against empty slice $SLICE_ID"
ok "check-dod-sweep.sh detected rule:dod-1 violations as expected"

# ----- done ------------------------------------------------------------------
log "smoke complete — all assertions passed"
