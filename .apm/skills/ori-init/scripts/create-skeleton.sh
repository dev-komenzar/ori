#!/usr/bin/env bash
# ori-init: create .ori/ skeleton in the current project.
#
# Skill-owned implementation per ori-execution-model-shift-2026-06-03
# (CLI 廃止 → skill のスクリプト実行ベース). This script is the single
# source of truth for `.ori/` initialization — no `ori init` CLI hop,
# no npm library dependency.
#
# Usage: create-skeleton.sh [--force] [--dest <dir>]
#
# Exit codes:
#   0  success
#   1  --dest invalid, missing template, or filesystem error
#   2  usage error (unknown flag)
set -euo pipefail

FORCE=false
DEST=""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TPL_DIR="$SCRIPT_DIR/templates"

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

if [[ ! -f "$TPL_DIR/config.yaml" || ! -f "$TPL_DIR/domain-scaffold.md.tpl" ]]; then
  echo "ERROR: skill templates missing under $TPL_DIR" >&2
  exit 1
fi

# Derive app name from --dest folder. Mirrors the (now-removed) CLI's
# deriveAppName: lowercase, non-[a-z0-9-] → '-', collapse '-', trim,
# fallback "app".
folder="$(basename "$DEST")"
app_name="$(printf '%s' "$folder" | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9-]\{1,\}/-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')"
[[ -z "$app_name" ]] && app_name="app"

# Directories — mirrors the (now-removed) CLI's DIRS table.
DIRS=(
  ".ori/domain/workflows"
  ".ori/domain/ui-fields"
  ".ori/domain/code"
  ".ori/slices"
  ".ori/pages"
  ".ori/proposals"
  ".ori/state"
)
for d in "${DIRS[@]}"; do
  mkdir -p "$DEST/$d"
done

# .gitkeep — keep empty VCS-tracked dirs visible.
for d in ".ori/slices" ".ori/pages" ".ori/proposals"; do
  target="$DEST/$d/.gitkeep"
  [[ -e "$target" ]] || : > "$target"
done

# .ori/config.yaml
CONFIG="$DEST/.ori/config.yaml"
if [[ -e "$CONFIG" && "$FORCE" != true ]]; then
  echo "WARN: .ori/config.yaml already exists. Use --force to overwrite." >&2
else
  # Use a sentinel placeholder (__APP_NAME__) substituted via sed.
  # app_name is sanitized to [a-z0-9-] above, so no sed metachar escaping needed.
  sed "s/__APP_NAME__/$app_name/g" "$TPL_DIR/config.yaml" > "$CONFIG"
  echo "OK: wrote .ori/config.yaml (app: $app_name, current_agent: claude)"
fi

# .ori/.gitignore
GITIGNORE="$DEST/.ori/.gitignore"
[[ -e "$GITIGNORE" ]] || printf 'state/\n' > "$GITIGNORE"

# Domain scaffolds — 12 phase outputs (DDD phase 1..11a + indexes).
# Format: path|title|phase. Order matches the original CLI table.
SCAFFOLDS=(
  ".ori/domain/discovery.md|Discovery|ori-ddd-1-discovery"
  ".ori/domain/event-storming.md|Event Storming|ori-ddd-2-event-storming"
  ".ori/domain/bounded-contexts.md|Bounded Contexts|ori-ddd-3-bounded-contexts"
  ".ori/domain/context-map.md|Context Map|ori-ddd-4-context-map"
  ".ori/domain/aggregates.md|Aggregates|ori-ddd-5-aggregates"
  ".ori/domain/domain-events.md|Domain Events|ori-ddd-6-domain-events"
  ".ori/domain/validation.md|Validation|ori-ddd-7-validation"
  ".ori/domain/glossary.md|Glossary|ori-ddd-8-glossary"
  ".ori/domain/workflows/index.md|Workflows Index|ori-ddd-9-workflows"
  ".ori/domain/types.md|Types Index|ori-ddd-10-types"
  ".ori/domain/code/index.md|Code Index|ori-ddd-10-types"
  ".ori/domain/ui-fields/index.md|UI Fields Index|ori-ddd-11a-ui-fields"
)

written=0
skipped=0
for entry in "${SCAFFOLDS[@]}"; do
  IFS='|' read -r rel title phase <<< "$entry"
  target="$DEST/$rel"
  if [[ -e "$target" && "$FORCE" != true ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  mkdir -p "$(dirname "$target")"
  sed -e "s/__TITLE__/$title/g" -e "s/__PHASE__/$phase/g" \
    "$TPL_DIR/domain-scaffold.md.tpl" > "$target"
  written=$((written + 1))
done
[[ $written -gt 0 ]] && echo "OK: seeded $written domain scaffold file(s) under .ori/domain/"
[[ $skipped -gt 0 ]] && echo "INFO: skipped $skipped existing scaffold file(s) (use --force to overwrite)."

# Initialize bd (beads) workspace so /ori-flow and other skills that treat
# beads as their SSoT can run immediately. Best-effort: missing `bd` is a
# warning (some users don't use beads), existing `.beads/` is honored
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
