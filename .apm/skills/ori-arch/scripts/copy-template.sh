#!/usr/bin/env bash
# ori-arch: copy a template directory into the current ori workspace.
#
# Usage: copy-template.sh --template <name> [--app <app-name>] [--dest <dir>]
#                          [--templates-dir <dir>] [--force]
#
# Exit codes:
#   0  success
#   1  template not found / IO error
#   2  usage error (missing required arg, unknown flag)
set -euo pipefail

TEMPLATE=""
APP_NAME=""
DEST=""
TEMPLATES_DIR_ARG=""
FORCE=false

usage() {
  cat >&2 <<'EOF'
Usage: copy-template.sh --template <name> [options]

Required:
  --template <name>      Template directory name under templates-dir
                         (e.g. ddd-vsa-hex-typescript, ddd-vsa-hex-typescript-tauri)

Options:
  --app <app-name>       Target app directory name. If omitted, derived from
                         .ori/config.yaml (workspace.apps[0].name) or cwd basename.
  --dest <dir>           Destination directory (default: current working directory)
  --templates-dir <dir>  Templates root. Overrides $ORI_TEMPLATES_DIR.
  --force                Overwrite existing files when copying (default: skip)
  -h, --help             Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --template)       TEMPLATE="${2:-}";       shift 2 ;;
    --app)            APP_NAME="${2:-}";       shift 2 ;;
    --dest)           DEST="${2:-}";           shift 2 ;;
    --templates-dir)  TEMPLATES_DIR_ARG="${2:-}"; shift 2 ;;
    --force)          FORCE=true;              shift ;;
    -h|--help)        usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$TEMPLATE" ]]; then
  echo "ERROR: --template is required" >&2
  usage
  exit 2
fi

# resolve dest
DEST="${DEST:-$PWD}"
if [[ ! -d "$DEST" ]]; then
  echo "ERROR: --dest does not exist: $DEST" >&2
  exit 1
fi
DEST="$(cd "$DEST" && pwd)"

# resolve templates dir (precedence: --templates-dir > $ORI_TEMPLATES_DIR > skill-bundled > ori-repo dev)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
declare -a CANDIDATES=()
[[ -n "$TEMPLATES_DIR_ARG" ]]            && CANDIDATES+=("$TEMPLATES_DIR_ARG")
[[ -n "${ORI_TEMPLATES_DIR:-}" ]]        && CANDIDATES+=("$ORI_TEMPLATES_DIR")
CANDIDATES+=("$SCRIPT_DIR/../templates")                   # skill-bundled
CANDIDATES+=("$SCRIPT_DIR/../../../../packages/templates") # ori repo dev: .apm/skills/ori-arch/scripts/ → 4 up

TEMPLATES_DIR=""
for cand in "${CANDIDATES[@]}"; do
  if [[ -d "$cand/$TEMPLATE" ]]; then
    TEMPLATES_DIR="$(cd "$cand" && pwd)"
    break
  fi
done

if [[ -z "$TEMPLATES_DIR" ]]; then
  {
    echo "ERROR: template '$TEMPLATE' not found in any of these locations:"
    for cand in "${CANDIDATES[@]}"; do
      echo "  - $cand/$TEMPLATE"
    done
    echo ""
    echo "Hint: set ORI_TEMPLATES_DIR or pass --templates-dir <path>."
  } >&2
  exit 1
fi

SRC="$TEMPLATES_DIR/$TEMPLATE"

# derive app name (from .ori/config.yaml if available, else cwd basename)
sanitize_app_name() {
  local raw="$1"
  local out
  out="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9-]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//')"
  [[ -z "$out" ]] && out="app"
  printf '%s\n' "$out"
}

if [[ -z "$APP_NAME" ]]; then
  CONFIG="$DEST/.ori/config.yaml"
  if [[ -f "$CONFIG" ]]; then
    # parse workspace.apps[0].name with awk (handles 2-space indentation written by ori init)
    APP_NAME="$(awk '
      /^[[:space:]]*workspace:[[:space:]]*$/ { in_ws=1; next }
      in_ws && /^[[:space:]]*apps:[[:space:]]*$/ { in_apps=1; next }
      in_apps && /^[[:space:]]*-[[:space:]]+name:[[:space:]]*/ {
        sub(/^[[:space:]]*-[[:space:]]+name:[[:space:]]*/, "")
        gsub(/^"|"$/, "")
        print; exit
      }
    ' "$CONFIG" 2>/dev/null || true)"
  fi
fi

if [[ -z "$APP_NAME" ]]; then
  APP_NAME="$(sanitize_app_name "$(basename "$DEST")")"
fi

# choose copy strategy
copy_with_rsync() {
  local extra=()
  [[ "$FORCE" != true ]] && extra+=("--ignore-existing")
  rsync -a "${extra[@]}" --exclude=node_modules --exclude=.git "$SRC/" "$DEST/"
}

copy_with_cp() {
  # POSIX fallback. Walks files; honors FORCE flag.
  ( cd "$SRC" && find . -type f -not -path "./node_modules/*" -not -path "./.git/*" -print0 ) \
    | while IFS= read -r -d '' rel; do
        rel="${rel#./}"
        dst="$DEST/$rel"
        if [[ -e "$dst" && "$FORCE" != true ]]; then
          continue
        fi
        mkdir -p "$(dirname "$dst")"
        cp -p "$SRC/$rel" "$dst"
      done
}

if command -v rsync >/dev/null 2>&1; then
  copy_with_rsync
else
  copy_with_cp
fi

# rename apps/template-app/ → apps/<APP_NAME>/
RENAMED=false
if [[ -d "$DEST/apps/template-app" && "$APP_NAME" != "template-app" ]]; then
  if [[ -e "$DEST/apps/$APP_NAME" ]]; then
    echo "WARN: apps/$APP_NAME already exists; leaving apps/template-app/ in place." >&2
  else
    mv "$DEST/apps/template-app" "$DEST/apps/$APP_NAME"
    RENAMED=true
  fi
fi

# write eslint.config.ori.js placeholder if absent so that `pnpm lint` does not
# fail before the user runs `pnpm arch:export`. The placeholder is an empty
# config array; `ori arch export --adapter=eslint` will overwrite it.
PLACEHOLDER_TARGETS=("$DEST/eslint.config.ori.js")
# For multi-root templates (e.g. tauri) the eslint.config.js sits at the ts
# root; future variants can extend this list as needed.
for placeholder in "${PLACEHOLDER_TARGETS[@]}"; do
  parent_dir="$(dirname "$placeholder")"
  config_js="$parent_dir/eslint.config.js"
  if [[ -f "$config_js" && ! -e "$placeholder" ]]; then
    cat > "$placeholder" <<'PLACEHOLDER_EOF'
// Placeholder generated by ori-arch scaffold.
// `ori arch export --adapter=eslint` will overwrite this file from
// .ori/architecture.md. Until then, eslint runs with an empty arch config.
export default [];
PLACEHOLDER_EOF
  fi
done

# update root package.json name (best-effort, only if it still has the template default)
if [[ -f "$DEST/package.json" ]] && command -v node >/dev/null 2>&1; then
  node - "$DEST/package.json" "$APP_NAME" <<'NODE_EOF' || true
const fs = require("node:fs");
const [path, appName] = [process.argv[2], process.argv[3]];
try {
  const text = fs.readFileSync(path, "utf8");
  const pkg = JSON.parse(text);
  const templateNames = new Set([
    "ddd-vsa-hex-typescript-app",
    "ddd-vsa-hex-typescript-tauri-app",
  ]);
  if (templateNames.has(pkg.name)) {
    pkg.name = appName;
    fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  }
} catch {
  // ignore — package.json absent or malformed; surface via build later
}
NODE_EOF
fi

echo ""
echo "Template:    $TEMPLATE"
echo "Source:      $SRC"
echo "Destination: $DEST"
echo "App name:    $APP_NAME$([[ "$RENAMED" == true ]] && echo "  (renamed apps/template-app → apps/$APP_NAME)" || echo "")"
echo "Force mode:  $FORCE"
echo ""
echo "Next steps:"
echo "  pnpm install"
echo "  pnpm test"
echo "  ori slice new <id>"
echo "  /ori-flow <id>"
