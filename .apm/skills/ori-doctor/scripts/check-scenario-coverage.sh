#!/usr/bin/env bash
# ori-doctor: validation.md の scenario section のうち未 scaffold のものを WARN (live 計算)
set -euo pipefail

# Auto-detect project root (PWD-first; SCRIPT_DIR fallback last).
# Why: when ori is installed inside a user project, SCRIPT_DIR resolves to the
# ori repo so git toplevel misses the user's .ori/ (ori-fzr.15).
PWD_DIR="$(pwd)"
PROJECT_ROOT="$(git -C "$PWD_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$PROJECT_ROOT" ] && [ ! -d "$PROJECT_ROOT/.ori" ]; then PROJECT_ROOT=""; fi
if [ -z "$PROJECT_ROOT" ]; then
  d="$PWD_DIR"
  while [ "$d" != "/" ]; do
    if [ -d "$d/.ori" ]; then PROJECT_ROOT="$d"; break; fi
    d="$(dirname "$d")"
  done
fi
if [ -z "$PROJECT_ROOT" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [ -z "$PROJECT_ROOT" ] || [ ! -d "$PROJECT_ROOT/.ori" ]; then echo "ERROR: cannot find project root (.ori/ not found)" >&2; exit 1; fi
cd "$PROJECT_ROOT"

# coverage は validation.md と .ori/scenarios/ から毎回 live 導出する (registry を持たない)。
# 導出ロジックは new-scenario.js --list-validation を再利用する。
if [[ ! -f .ori/domain/validation.md ]]; then
  echo "  scenario coverage: no .ori/domain/validation.md (skipped)"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NEW_SCENARIO=""
for cand in "$SCRIPT_DIR/../../ori-flow/scripts/new-scenario.js" \
            ".apm/skills/ori-flow/scripts/new-scenario.js" \
            ".claude/skills/ori-flow/scripts/new-scenario.js"; do
  if [[ -f "$cand" ]]; then NEW_SCENARIO="$cand"; break; fi
done
if [[ -z "$NEW_SCENARIO" ]] || ! command -v node >/dev/null 2>&1; then
  echo "  scenario coverage: new-scenario.js or node unavailable (skipped)"
  exit 0
fi

OUT="$(node "$NEW_SCENARIO" --list-validation 2>/dev/null || true)"

ISSUES=0
while IFS= read -r line; do
  id="$(awk '{print $1}' <<<"$line")"
  echo "  WARN  validation.md#$id: scenario 未 scaffold"
  echo "        fix: node <ori-flow>/scripts/new-scenario.js $id  (scaffold 後 /ori-flow $id)"
  ((ISSUES++)) || true
done < <(grep -F 'candidate (not scaffolded' <<<"$OUT" || true)

summary="$(grep -E '^coverage: ' <<<"$OUT" || true)"
echo "  scenario ${summary:-coverage: n/a}"
exit $ISSUES
