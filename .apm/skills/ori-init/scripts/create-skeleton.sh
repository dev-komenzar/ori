#!/usr/bin/env bash
# ori-init: create .ori/ skeleton directory structure
# Usage: ./create-skeleton.sh [--force]
#   --force  Overwrite existing .ori/ if present
set -euo pipefail

# Auto-detect project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$PROJECT_ROOT" ]; then
  d="$SCRIPT_DIR"
  while [ "$d" != "/" ]; do
    if [ -d "$d/.ori" ]; then PROJECT_ROOT="$d"; break; fi
    d="$(dirname "$d")"
  done
fi
if [ -z "$PROJECT_ROOT" ]; then echo "ERROR: cannot find project root (.ori/ not found)" >&2; exit 1; fi
cd "$PROJECT_ROOT"

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

if [[ -d .ori ]] && [[ "$FORCE" != "true" ]]; then
  echo "ERROR: .ori/ already exists. Use --force to overwrite." >&2
  exit 1
fi

[[ "$FORCE" == "true" ]] && rm -rf .ori

mkdir -p .ori/domain/workflows
mkdir -p .ori/domain/ui-fields
mkdir -p .ori/domain/code
mkdir -p .ori/slices
mkdir -p .ori/pages
mkdir -p .ori/proposals
mkdir -p .ori/state

cat > .ori/config.yaml <<'YAMLEOF'
# ori project configuration
current_agent: claude
language: typescript
YAMLEOF

cat > .ori/state/session.md <<'MDEOF'
# Session State
MDEOF

echo "Created .ori/ skeleton"
ls -R .ori/
