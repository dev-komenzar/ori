#!/usr/bin/env bash
#
# v0.3-M (ori-1pe) — @ori-ori/parser の npm deprecate 強化
#
# parser は ori 内部の skill (ori-arch / ori-doctor / arch-adapters 等) からのみ
# 利用される library で、外部 plugin consumer が存在しないため、Phase J の
# arch-adapter-* と同じ「private 化 + skill-only 配布」方針に揃える。
#
# packages/parser/package.json は private: true へ移行済 (pnpm -r publish の
# 対象外)。本 script は既に publish 済の v0.2.0 を含む全 version を deprecate
# して、誤って `pnpm add @ori-ori/parser` してきた consumer に APM 動線を
# 案内する。
#
# Pre-requisite: npm login (npm owner であること)
# Idempotent: 既に deprecated でも message を上書きできる。
#
# 使い方:
#   bash scripts/npm-deprecate-parser.sh

set -euo pipefail

MESSAGE_PARSER="Now bundled into ori skill scripts (.apm/skills/ori-arch / ori-doctor 等) via APM (v0.3-M). External library consumption is no longer supported. Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"

echo "→ npm deprecate @ori-ori/parser@'<=0.2.0'"
npm deprecate "@ori-ori/parser@<=0.2.0" "$MESSAGE_PARSER"

echo ""
echo "Done. 確認:"
echo "  npm view @ori-ori/parser deprecated"
