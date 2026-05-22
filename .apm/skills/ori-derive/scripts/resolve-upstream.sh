#!/usr/bin/env bash
# ori-derive: resolve upstream sections and compute hashes
# Usage: ./resolve-upstream.sh <slice-id>
# Reads manifest.yaml, outputs upstream file paths and their sha256 hashes
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

ID="${1:-}"
if [[ -z "$ID" ]]; then
  echo "ERROR: slice-id required" >&2
  exit 1
fi

MANIFEST=".ori/slices/$ID/manifest.yaml"
if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: $MANIFEST not found" >&2
  exit 1
fi

# Extract derives_from entries
grep '^  - ' "$MANIFEST" | sed 's/  - //' | while read -r ref; do
  file="${ref%%#*}"
  section="${ref##*#}"
  path=".ori/$file"
  if [[ -f "$path" ]]; then
    hash=$(sha256sum "$path" | cut -c1-12)
    echo "$ref $hash"
  else
    echo "$ref NOT_FOUND" >&2
  fi
done
