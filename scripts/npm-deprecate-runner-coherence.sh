#!/usr/bin/env bash
#
# v0.3-N (ori-hqr) — @ori-ori/slice-runner + @ori-ori/coherence の npm deprecate 強化
#
# Phase M (ori-1pe) で @ori-ori/parser を private 化したのと同条件で残っていた
# 2 package を、同じ「private: true + skill-only 配布」方針に揃える cleanup。
# どちらも ori 内部 skill (ori-flow / ori-model) からのみ利用される library で、
# 外部 plugin consumer は存在しない。
#
# - slice-runner は ori-flow / ori-model skill の esbuild bundle に inline 済
# - coherence は slice-runner 経由で同 skill bundle に間接 inline 済
#
# packages/slice-runner/package.json と packages/coherence/package.json は
# private: true へ移行済 (pnpm -r publish の対象外)。本 script は既に publish
# 済の v0.2.0 を含む全 version を deprecate して、誤って npm 経由で install
# してきた consumer に APM 動線を案内する。
#
# Pre-requisite: npm login (npm owner であること)
# Idempotent: 既に deprecated でも message を上書きできる。
#
# 使い方:
#   bash scripts/npm-deprecate-runner-coherence.sh

set -euo pipefail

MESSAGE_RUNNER="Now bundled into ori skill scripts (.apm/skills/ori-flow / ori-model 等) via APM (v0.3-N). External library consumption is no longer supported. Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"
MESSAGE_COHERENCE="Now bundled into ori skill scripts (.apm/skills/ori-flow / ori-model 等) via APM (v0.3-N, through @ori-ori/slice-runner). External library consumption is no longer supported. Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"

echo "→ npm deprecate @ori-ori/slice-runner@'<=0.2.0'"
npm deprecate "@ori-ori/slice-runner@<=0.2.0" "$MESSAGE_RUNNER"

echo "→ npm deprecate @ori-ori/coherence@'<=0.2.0'"
npm deprecate "@ori-ori/coherence@<=0.2.0" "$MESSAGE_COHERENCE"

echo ""
echo "Done. 確認:"
echo "  npm view @ori-ori/slice-runner deprecated"
echo "  npm view @ori-ori/coherence deprecated"
