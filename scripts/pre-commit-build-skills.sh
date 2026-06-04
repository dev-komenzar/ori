#!/usr/bin/env bash
set -euo pipefail

if ! git diff --cached --name-only | grep -q "^packages/skills/.*/src/"; then
  exit 0
fi

echo "🔨 skills src が staged → pnpm build:skills を実行します..."
pnpm build:skills

# bundle が更新されていれば staging に追加
git add .apm/skills/*/scripts/ 2>/dev/null || true
echo "✓ bundle 更新 + staged に追加しました"
