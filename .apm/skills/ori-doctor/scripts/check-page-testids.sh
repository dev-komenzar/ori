#!/usr/bin/env bash
# ori-doctor: page / widget の testid 契約 (.ori/pages/<id>/testids.yaml) の横断検査 (ori-oan.7)
# 本体は同 bundle の testids.js check --all。契約 ⊆ 実装・derived の stale・extra 形式・実装 testid lint を検出する。
# scenario-first で後から extra に増えた行 (source: scenario:<id>) の実装追従漏れもここで拾う。
#
# Usage: check-page-testids.sh [--emit-issues]
#   --emit-issues  page ごとに bd issue を起票 (label: testid-violation + page:<id>。open 重複は re-file しない)
set -euo pipefail

EMIT_ISSUES=false
[[ "${1:-}" == "--emit-issues" ]] && EMIT_ISSUES=true

# Auto-detect project root (PWD-first; SCRIPT_DIR fallback last).
# Why: when ori is installed inside a user project, SCRIPT_DIR resolves to the
# ori repo so git toplevel misses the user's .ori/ (ori-fzr.15).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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
cd "$PROJECT_ROOT"

has_page=false
for m in .ori/pages/*/manifest.yaml; do [[ -f "$m" ]] && has_page=true && break; done
if [[ "$has_page" != true ]]; then
  echo "  page testids: no .ori/pages/*/manifest.yaml"
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "  WARN  page testids: node が無いため skip"
  exit 0
fi

out="$(node "$SCRIPT_DIR/testids.js" check --all --root "$PROJECT_ROOT" 2>&1 || true)"
violations="$(grep '^VIOLATION ' <<<"$out" || true)"
ISSUES=0
[[ -n "$violations" ]] && ISSUES=$(wc -l <<<"$violations")

while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  echo "  WARN  ${line#VIOLATION }"
done <<<"$violations"
# testids.js 自体のエラー (VIOLATION 以外の ERROR 行) は握り潰さない
grep '^ERROR' <<<"$out" | sed 's/^/  /' || true

if [[ $ISSUES -gt 0 ]]; then
  echo "        fix: /ori-flow <page-id> (実装を契約に追従) / derived stale は testids.js sync <page-id>"
fi

if [[ "$EMIT_ISSUES" == true && $ISSUES -gt 0 ]]; then
  if ! command -v bd >/dev/null 2>&1; then
    echo "    WARN: bd not on PATH; cannot auto-file issue" >&2
  else
    # page 単位に集約して起票 (impl lint は page に紐付かないため page:_impl)
    for key in $(sed -E 's/^VIOLATION (impl|[a-z0-9-]+):.*/\1/' <<<"$violations" | sort -u); do
      page="$key"; [[ "$key" == impl ]] && page="_impl"
      existing="$(bd list --label=testid-violation --label="page:${page}" --status=open 2>/dev/null | grep -E '^○|^◐' | head -n1 || true)"
      if [[ -n "$existing" ]]; then
        echo "    INFO: page:${page} の open issue あり — re-file しない (idempotent)"
        continue
      fi
      detail="$(grep -E "^VIOLATION ${key}:" <<<"$violations" | sed 's/^VIOLATION /- /')"
      bd create \
        --title="[testid] ${page}: page testid 契約違反" \
        --description="${detail}

Reference:
- 契約: .ori/pages/${page}/testids.yaml / 規範: ddd-vsa-hex/pattern.md \"page / widget の testid 契約\"
- Auto-filed by: ori-doctor scripts/check-page-testids.sh --emit-issues" \
        --type=bug \
        --priority=2 \
        --labels="testid-violation,page:${page}" >/dev/null \
        && echo "    ✓ filed bd issue (testid-violation, page:${page})" \
        || echo "    WARN: bd create failed — issue not filed" >&2
    done
  fi
fi

echo "  page testids: $ISSUES issue(s)"
# exit code は件数 (run-checks.sh が合算)。256 で 0 に巻き戻らないよう 255 で頭打ち
exit $(( ISSUES > 255 ? 255 : ISSUES ))
