#!/usr/bin/env bash
# Verifies .apm/contexts/patterns/ddd-vsa-hex/ has the expected pattern
# structure (design.md §6). Pure file-inventory + frontmatter / placeholder
# checks — heavy YAML/schema validation lives in the parser & adapter
# packages' own tests, so this script intentionally stays lightweight.
#
# Invoke directly:    bash packages/skills/ori-arch/tests/pattern-ddd-vsa-hex.test.sh
# Or via the script:  pnpm -F @ori-ori/skill-ori-arch test
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
PATTERN="$REPO_ROOT/.apm/contexts/patterns/ddd-vsa-hex"

PASS=0
FAIL=0
declare -a FAILURES

check() {
  local label="$1"
  if eval "$2" >/dev/null 2>&1; then
    PASS=$((PASS + 1))
    printf '  \033[32m✓\033[0m %s\n' "$label"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$label")
    printf '  \033[31m✗\033[0m %s\n' "$label"
  fi
}

# Extract YAML between the first pair of `---` lines.
extract_frontmatter() {
  awk '/^---[[:space:]]*$/{c++; if (c==1) next; if (c==2) exit} c==1' "$1"
}

# Substitute {{KEY}} placeholders with the test fixture values.
render_tpl() {
  sed -e 's|{{APP_NAME}}|myapp|g' \
      -e 's|{{BC_NAME_RS}}|task_management|g' \
      -e 's|{{BC_NAME}}|task-management|g' \
      "$1"
}

section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- pattern.md
section "pattern.md frontmatter (design.md §6 schema)"
PATTERN_MD="$PATTERN/pattern.md"
check "file exists"                     "[ -f \"$PATTERN_MD\" ]"
FM_PATTERN="$(extract_frontmatter "$PATTERN_MD")"
check "ori.node_id = pattern:ddd-vsa-hex" \
  "printf '%s\n' \"\$FM_PATTERN\" | grep -qE '^[[:space:]]+node_id:[[:space:]]+pattern:ddd-vsa-hex[[:space:]]*\$'"
check "ori.type = pattern" \
  "printf '%s\n' \"\$FM_PATTERN\" | grep -qE '^[[:space:]]+type:[[:space:]]+pattern[[:space:]]*\$'"
check "ori.default_layer_set = ddd-vsa-hex-ts" \
  "printf '%s\n' \"\$FM_PATTERN\" | grep -qE '^[[:space:]]+default_layer_set:[[:space:]]+ddd-vsa-hex-ts[[:space:]]*\$'"
check "ori.alternate_layer_sets contains ddd-vsa-hex-rs" \
  "printf '%s\n' \"\$FM_PATTERN\" | grep -qE 'alternate_layer_sets:.*ddd-vsa-hex-rs'"

section "pattern.md required sections"
for h in \
  "## Summary" \
  "## When to use" \
  "## When NOT to use" \
  "## Tradeoffs" \
  "## Conceptual structure" \
  "## Layer responsibilities" \
  "## Dependency rules" \
  "## Naming conventions" \
  "## Cross-cutting concerns placement"; do
  check "section: $h" "grep -qF \"$h\" \"$PATTERN_MD\""
done

# ---------------------------------------------------------------- ai-notes.md
section "ai-notes.md frontmatter"
AI_MD="$PATTERN/ai-notes.md"
check "file exists" "[ -f \"$AI_MD\" ]"
FM_AI="$(extract_frontmatter "$AI_MD")"
check "ori.node_id = pattern:ddd-vsa-hex/ai-notes" \
  "printf '%s\n' \"\$FM_AI\" | grep -qE '^[[:space:]]+node_id:[[:space:]]+pattern:ddd-vsa-hex/ai-notes[[:space:]]*\$'"
check "ori.type = pattern-ai-notes" \
  "printf '%s\n' \"\$FM_AI\" | grep -qE '^[[:space:]]+type:[[:space:]]+pattern-ai-notes[[:space:]]*\$'"
check "ori.applies_to = pattern:ddd-vsa-hex" \
  "printf '%s\n' \"\$FM_AI\" | grep -qE '^[[:space:]]+applies_to:[[:space:]]+pattern:ddd-vsa-hex[[:space:]]*\$'"

# ---------------------------------------------------------- typescript stack
section "stacks/typescript/architecture.md.tpl"
TPL_TS="$PATTERN/stacks/typescript/architecture.md.tpl"
check "file exists"                  "[ -f \"$TPL_TS\" ]"
check "contains {{APP_NAME}}"        "grep -qF '{{APP_NAME}}' \"$TPL_TS\""
check "contains {{BC_NAME}}"         "grep -qF '{{BC_NAME}}'  \"$TPL_TS\""
check "no {{BC_NAME_RS}} leak (ts-only)" \
  "! grep -qF '{{BC_NAME_RS}}' \"$TPL_TS\""

RENDERED_TS="$(render_tpl "$TPL_TS")"
check "rendered: no leftover {{...}} placeholders" \
  "! printf '%s\n' \"\$RENDERED_TS\" | grep -qE '\\{\\{[A-Z_]+\\}\\}'"
check "rendered: app: myapp" \
  "printf '%s\n' \"\$RENDERED_TS\" | grep -qE '^[[:space:]]+app:[[:space:]]+myapp[[:space:]]*\$'"
check "rendered: path: apps/myapp/src" \
  "printf '%s\n' \"\$RENDERED_TS\" | grep -qE '^[[:space:]]+path:[[:space:]]+apps/myapp/src[[:space:]]*\$'"
check "rendered: slice_root: task-management" \
  "printf '%s\n' \"\$RENDERED_TS\" | grep -qE '^[[:space:]]+slice_root:[[:space:]]+task-management[[:space:]]*\$'"
check "rendered: layer_set: ddd-vsa-hex-ts" \
  "printf '%s\n' \"\$RENDERED_TS\" | grep -qE '^[[:space:]]+layer_set:[[:space:]]+ddd-vsa-hex-ts[[:space:]]*\$'"
check "rendered: cross_slice.prohibited_direct: true" \
  "printf '%s\n' \"\$RENDERED_TS\" | grep -qE '^[[:space:]]+prohibited_direct:[[:space:]]+true[[:space:]]*\$'"

# ---------------------------------------------------- typescript-tauri stack
section "stacks/typescript-tauri/architecture.md.tpl"
TPL_TAURI="$PATTERN/stacks/typescript-tauri/architecture.md.tpl"
check "file exists"               "[ -f \"$TPL_TAURI\" ]"
check "contains {{APP_NAME}}"     "grep -qF '{{APP_NAME}}'    \"$TPL_TAURI\""
check "contains {{BC_NAME}}"      "grep -qF '{{BC_NAME}}'     \"$TPL_TAURI\""
check "contains {{BC_NAME_RS}}"   "grep -qF '{{BC_NAME_RS}}'  \"$TPL_TAURI\""

RENDERED_TAURI="$(render_tpl "$TPL_TAURI")"
check "rendered: no leftover {{...}} placeholders" \
  "! printf '%s\n' \"\$RENDERED_TAURI\" | grep -qE '\\{\\{[A-Z_]+\\}\\}'"
check "rendered: ts root path apps/myapp/src" \
  "printf '%s\n' \"\$RENDERED_TAURI\" | grep -qE '^[[:space:]]+path:[[:space:]]+apps/myapp/src[[:space:]]*\$'"
check "rendered: rs root path apps/myapp/src-tauri/src" \
  "printf '%s\n' \"\$RENDERED_TAURI\" | grep -qE '^[[:space:]]+path:[[:space:]]+apps/myapp/src-tauri/src[[:space:]]*\$'"
check "rendered: rs slice_root: task_management" \
  "printf '%s\n' \"\$RENDERED_TAURI\" | grep -qE '^[[:space:]]+slice_root:[[:space:]]+task_management[[:space:]]*\$'"
check "rendered: cross_root generator: tauri-specta" \
  "printf '%s\n' \"\$RENDERED_TAURI\" | grep -qE 'generator:[[:space:]]+tauri-specta'"
check "rendered: TS bindings target path" \
  "printf '%s\n' \"\$RENDERED_TAURI\" | grep -qF 'apps/myapp/src/task-management/shared/ipc/bindings.ts'"
check "rendered: ui-layer forbidden_imports retains @tauri-apps/api/core" \
  "printf '%s\n' \"\$RENDERED_TAURI\" | grep -qF '@tauri-apps/api/core'"

# ------------------------------------------------ example-slice inventory (TS)
section "stacks/typescript/example-slice/task-management/"
TS_BASE="$PATTERN/stacks/typescript/example-slice/task-management"
for f in \
  shared/index.ts \
  shared/types/result.ts \
  shared/types/index.ts \
  shared/events/event.ts \
  shared/events/index.ts \
  shared/contracts/index.ts \
  slices/complete-task/index.ts \
  slices/complete-task/domain/task.ts \
  slices/complete-task/domain/task-id.ts \
  slices/complete-task/domain/task-title.ts \
  slices/complete-task/domain/events.ts \
  slices/complete-task/application/complete-task.ts \
  slices/complete-task/presentation/task-card.ts \
  slices/complete-task/tests/task.test.ts; do
  check "$f" "[ -f \"$TS_BASE/$f\" ]"
done

# --------------------------------------------- example-slice inventory (tauri)
section "stacks/typescript-tauri/example-slice/{ts,rust}/"
TAURI_TS="$PATTERN/stacks/typescript-tauri/example-slice/ts/task-management"
TAURI_RS="$PATTERN/stacks/typescript-tauri/example-slice/rust/task_management"
for f in \
  shared/index.ts \
  shared/ipc/bindings.ts \
  shared/ipc/index.ts \
  slices/complete-task/index.ts \
  slices/complete-task/domain/task.ts \
  slices/complete-task/application/complete-task.ts \
  slices/complete-task/tests/task.test.ts; do
  check "ts/$f" "[ -f \"$TAURI_TS/$f\" ]"
done
for f in \
  mod.rs \
  shared/mod.rs \
  shared/result.rs \
  shared/events.rs \
  slices/mod.rs \
  slices/complete_task/mod.rs \
  slices/complete_task/domain.rs \
  slices/complete_task/application.rs \
  slices/complete_task/infrastructure.rs \
  slices/complete_task/commands.rs; do
  check "rust/$f" "[ -f \"$TAURI_RS/$f\" ]"
done
check "rust/lib.rs" \
  "[ -f \"$PATTERN/stacks/typescript-tauri/example-slice/rust/lib.rs\" ]"

# ------------------------------------------- no bootstrap files in study material
section "example-slice/ ships no bootstrap files (upstream framework init owns these)"
for base in \
  "$PATTERN/stacks/typescript/example-slice" \
  "$PATTERN/stacks/typescript-tauri/example-slice"; do
  while IFS= read -r f; do
    found="$(find "$base" -name "$f" -print -quit 2>/dev/null)"
    label="${base#"$PATTERN/stacks/"}/.../$f"
    check "no $label" "[ -z \"$found\" ]"
  done <<< "package.json
tsconfig.json
eslint.config.js
vitest.config.ts
Cargo.toml"
done

# ------------------------------------------- TS example-slice: no cross-slice reach
section "TS example-slice respects cross-slice rule"
SLICE_DIR="$TS_BASE/slices/complete-task"
# A relative `from "..."` that contains "slices/" must mean reaching into
# another slice — the within-slice relative imports never traverse `slices/`.
CROSS_HITS="$(grep -RhnE 'from[[:space:]]+"\.\.[^"]*slices/' "$SLICE_DIR" 2>/dev/null || true)"
check "no cross-slice direct import in complete-task" "[ -z \"$CROSS_HITS\" ]"

# ----------------------------------------------------------------- summary
printf '\n\033[1m==========================================\033[0m\n'
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32m  All %d checks passed.\033[0m\n' "$PASS"
else
  printf '\033[31m  %d failed, \033[32m%d passed\033[31m.\033[0m\n' "$FAIL" "$PASS"
  printf '\nFailed checks:\n'
  for f in "${FAILURES[@]}"; do printf '  - %s\n' "$f"; done
fi
printf '\033[1m==========================================\033[0m\n'

exit "$FAIL"
