#!/usr/bin/env bash
# ori-doctor: ui-fields にあるが持ち主 page の spec に挙動規定が無い field を WARN (ori-oan.13.7、§15)
# 本体は同 bundle の testids.js spec-gaps --all。「規定あり」= page/widget の spec.md の #invariants / #test-points
# (fenced code 外、**TBD** の行を除く) に field id が literal で出ること。レイアウト図・入出力だけの言及は数えない。
# WARN only (件数を exit code で返す。検査できなかった page は ERROR 行として 1 件に数え、他 page の検査は続ける)。実装は見ない (実装側の欠落は check-page-testids.sh)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Auto-detect project root (PWD-first; SCRIPT_DIR fallback last). ori-fzr.15
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
  PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [ -z "$PROJECT_ROOT" ] || [ ! -d "$PROJECT_ROOT/.ori" ]; then echo "ERROR: cannot find project root (.ori/ not found)" >&2; exit 1; fi

if [ ! -d "$PROJECT_ROOT/.ori/pages" ]; then
  echo "  spec gaps: no .ori/pages/ (skipped)"
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "  spec gaps: node unavailable (skipped)"
  exit 0
fi

rc=0
out="$(node "$SCRIPT_DIR/testids.js" spec-gaps --all --root "$PROJECT_ROOT" 2>&1)" || rc=$?
# 完走しなかった (crash / YAML 破損 / usage) 場合は green にしない
if [ "$rc" -gt 1 ] || { [ "$rc" -eq 1 ] && ! grep -q '^挙動規定の無い field: ' <<<"$out"; }; then
  echo "  ERROR spec gaps: testids.js spec-gaps が完走しませんでした (exit $rc)"
  sed 's/^/        /' <<<"$out"
  exit 1
fi

ISSUES=0
while IFS= read -r line; do
  case "$line" in
    WARN*|ERROR*) echo "  $line"; ((ISSUES++)) || true ;;
    "      fix:"*|SKIP*) echo "  $line" ;;
  esac
done <<<"$out"

echo "  spec gaps: $ISSUES issue(s)"
# exit code は件数 (run-checks.sh が合算)。256 で 0 に巻き戻らないよう 255 で頭打ち
exit $(( ISSUES > 255 ? 255 : ISSUES ))
