#!/usr/bin/env bash
# ori-init: create .ori/ skeleton in the current project.
#
# Invokes @ori-ori/init-core directly (no ori CLI hop), per
# ori-execution-model-shift-2026-06-03 (skill drives core package directly).
#
# Usage: create-skeleton.sh [--force] [--dest <dir>]
#
# Exit codes:
#   0  success
#   1  no init-core runner available, or init-core failed
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

# Pick runner: prefer ori-init-skeleton on PATH (when @ori-ori/init-core is
# globally installed), otherwise resolve via pnpm dlx / npx. Both forwarders
# point at the same npm bin: `ori-init-skeleton`.
declare -a CMD=()
if command -v ori-init-skeleton >/dev/null 2>&1; then
  CMD=(ori-init-skeleton)
elif command -v pnpm >/dev/null 2>&1; then
  CMD=(pnpm dlx -p @ori-ori/init-core ori-init-skeleton)
elif command -v npx >/dev/null 2>&1; then
  CMD=(npx --yes -p @ori-ori/init-core ori-init-skeleton)
else
  {
    echo "ERROR: cannot locate an @ori-ori/init-core runner."
    echo ""
    echo "Install one of:"
    echo "  - npm install -g @ori-ori/init-core   (then 'ori-init-skeleton' is on PATH)"
    echo "  - pnpm (provides 'pnpm dlx -p @ori-ori/init-core ori-init-skeleton')"
    echo "  - npx  (provides 'npx -p @ori-ori/init-core ori-init-skeleton')"
  } >&2
  exit 1
fi

CMD+=(--dest "$DEST")
[[ "$FORCE" == true ]] && CMD+=(--force)

echo "Running: ${CMD[*]}"
"${CMD[@]}"

# Initialize bd (beads) workspace so /ori-flow and other skills that treat
# beads as their SSoT can run immediately. Best-effort: missing `bd` is a
# warning, existing `.beads/` is honored (idempotent), and bd-side failure
# does not propagate to exit code.
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
