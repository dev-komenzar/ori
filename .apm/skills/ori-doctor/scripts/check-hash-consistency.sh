#!/usr/bin/env bash
# ori-doctor: spec の coherence.hash と upstream file の実 hash (sha256 先頭 12 桁) を突き合わせる (ori-0eh.5)
# 本体は同 bundle の check-hash-consistency.js (packages/skills/ori-doctor/src/check-hash-consistency.ts)。
# 全 .ori/{slices,pages,scenarios}/*/spec.md が対象。drift / file 欠落 / キー集合差分 / hash 未記録を issue として数える。
#
# Usage: check-hash-consistency.sh [<kind>/<id>...]   (省略時は全件。finalize gate は単一ターゲットで呼ぶ)
# exit code: 0..63 = issue 件数 (63 で頭打ち) / 64 = 引数・環境の誤り (対象 id なし・不明 option・.ori/ なし)
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
if [ -z "$PROJECT_ROOT" ] || [ ! -d "$PROJECT_ROOT/.ori" ]; then echo "ERROR: cannot find project root (.ori/ not found)" >&2; exit 64; fi
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "  WARN  hash consistency: node が無いため skip"
  exit 0
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
rc=0
node "$SCRIPT_DIR/check-hash-consistency.js" --root "$PROJECT_ROOT" "$@" || rc=$?
exit $rc
