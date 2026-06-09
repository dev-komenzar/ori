#!/usr/bin/env bash
#
# v0.3-J (ori-osm + ori-u5d) — @ori-ori/arch-adapter-* の npm deprecate 強化
#
# 旧 npm package は APM bundle (.apm/contexts/adapters/) に embed され publish 停止。
# 既存 publish 済の 0.2.0 を含む全 version を deprecate して、
# `pnpm add -D @ori-ori/arch-adapter-eslint` してきた consumer に APM 動線を案内する。
#
# Pre-requisite: npm login (npm owner であること)
# Idempotent: 既に deprecated でも message を上書きできる。
#
# 使い方:
#   bash scripts/npm-deprecate-adapters.sh
#
# ori-u5d 観察: 旧メッセージは「Reserved for future use」だったが実態は機能 active で齟齬。
# 新メッセージは「APM bundle に移行済」を明示する。

set -euo pipefail

MESSAGE_ESLINT="Now bundled into .apm/contexts/adapters/eslint via APM (v0.3-J). Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"
MESSAGE_RUST="Now bundled into .apm/contexts/adapters/rust via APM (v0.3-J). Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"
MESSAGE_GENERIC="Now bundled into .apm/contexts/adapters/generic via APM (v0.3-J). Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"

echo "→ npm deprecate @ori-ori/arch-adapter-eslint@'<=0.2.0'"
npm deprecate "@ori-ori/arch-adapter-eslint@<=0.2.0" "$MESSAGE_ESLINT"

echo "→ npm deprecate @ori-ori/arch-adapter-rust@'<=0.2.0'"
npm deprecate "@ori-ori/arch-adapter-rust@<=0.2.0" "$MESSAGE_RUST"

echo "→ npm deprecate @ori-ori/arch-adapter-generic@'<=0.2.0'"
npm deprecate "@ori-ori/arch-adapter-generic@<=0.2.0" "$MESSAGE_GENERIC"

echo ""
echo "Done. 確認:"
echo "  npm view @ori-ori/arch-adapter-eslint deprecated"
echo "  npm view @ori-ori/arch-adapter-rust deprecated"
echo "  npm view @ori-ori/arch-adapter-generic deprecated"
