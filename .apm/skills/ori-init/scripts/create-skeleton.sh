#!/usr/bin/env bash
# ori-init: create .ori/ skeleton in the current project.
#
# Transitional implementation (ori-05r): this script delegates to the `ori init`
# CLI binary. The longer-term plan (ori-execution-model-shift-2026-06-03) is to
# split init core into a published npm package so the skill can drive it
# directly without a CLI hop — tracked as a separate refactor issue.
#
# Usage: create-skeleton.sh [--force] [--dest <dir>]
#
# Exit codes:
#   0  success
#   1  ori CLI not found, or `ori init` failed
#   2  usage error (unknown flag)
set -euo pipefail

FORCE=false
DEST=""

usage() {
  cat >&2 <<'EOF'
Usage: create-skeleton.sh [options]

Options:
  --force         Overwrite existing .ori/ files when present
  --dest <dir>    Destination directory (default: current working directory)
  -h, --help      Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)     FORCE=true; shift ;;
    --dest)      DEST="${2:-}"; shift 2 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

DEST="${DEST:-$PWD}"
if [[ ! -d "$DEST" ]]; then
  echo "ERROR: --dest does not exist: $DEST" >&2
  exit 1
fi
DEST="$(cd "$DEST" && pwd)"

# pick runner: prefer `ori` on PATH; fall back to `pnpm dlx` / `npx`.
# pnpm dlx parses the first non-flag arg as the package and forwards the rest
# to the package's bin (here `ori`), so `pnpm dlx @ori-ori/cli init` ⇒ `ori init`.
# npx accepts `-p <pkg> <bin>` to run a bin whose name differs from the package.
declare -a CMD=()
if command -v ori >/dev/null 2>&1; then
  CMD=(ori init)
elif command -v pnpm >/dev/null 2>&1; then
  CMD=(pnpm dlx @ori-ori/cli init)
elif command -v npx >/dev/null 2>&1; then
  CMD=(npx --yes -p @ori-ori/cli ori init)
else
  {
    echo "ERROR: cannot locate an ori CLI runner."
    echo ""
    echo "Install one of:"
    echo "  - npm install -g @ori-ori/cli   (then 'ori' is on PATH)"
    echo "  - pnpm (provides 'pnpm dlx @ori-ori/cli init')"
    echo "  - npx  (provides 'npx -p @ori-ori/cli ori init')"
  } >&2
  exit 1
fi

[[ "$FORCE" == true ]] && CMD+=(--force)

echo "Running: ${CMD[*]}  (in $DEST)"
( cd "$DEST" && "${CMD[@]}" )

# Initialize bd (beads) workspace so /ori-flow and other skills that treat
# beads as their SSoT can run immediately. This is best-effort: missing `bd`
# is a warning (some users don't use beads), existing `.beads/` is honored
# (idempotent), and any bd-side failure does not propagate to exit code.
init_bd_workspace() {
  if ! command -v bd >/dev/null 2>&1; then
    echo "NOTE: 'bd' not found on PATH — skipping beads workspace init." >&2
    echo "      Install beads (https://github.com/steveyegge/beads) to enable /ori-flow." >&2
    return 0
  fi
  if [[ -d "$DEST/.beads" ]]; then
    echo "NOTE: $DEST/.beads/ already exists — skipping bd init (idempotent)."
    return 0
  fi

  # Normalize prefix: bd requires a trailing hyphen ('ori' → 'ori-').
  local prefix="${ORI_BD_PREFIX:-ori}"
  [[ "$prefix" != *- ]] && prefix="${prefix}-"

  echo "Running: bd init -p $prefix --non-interactive  (in $DEST)"
  if ! ( cd "$DEST" && bd init -p "$prefix" --non-interactive --quiet ); then
    echo "WARN: 'bd init' failed; continuing without beads workspace." >&2
    echo "      Re-run manually: bd init -p $prefix" >&2
    return 0
  fi
}

init_bd_workspace
