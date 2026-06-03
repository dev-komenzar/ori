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
declare -a CMD=()
if command -v ori >/dev/null 2>&1; then
  CMD=(ori init)
elif command -v pnpm >/dev/null 2>&1; then
  CMD=(pnpm dlx -p @ori-ori/cli ori init)
elif command -v npx >/dev/null 2>&1; then
  CMD=(npx --yes -p @ori-ori/cli ori init)
else
  {
    echo "ERROR: cannot locate an ori CLI runner."
    echo ""
    echo "Install one of:"
    echo "  - npm install -g @ori-ori/cli   (then 'ori' is on PATH)"
    echo "  - pnpm (provides 'pnpm dlx @ori-ori/cli')"
    echo "  - npx  (provides 'npx -p @ori-ori/cli ori init')"
  } >&2
  exit 1
fi

[[ "$FORCE" == true ]] && CMD+=(--force)

echo "Running: ${CMD[*]}  (in $DEST)"
( cd "$DEST" && "${CMD[@]}" )
