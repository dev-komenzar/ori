#!/usr/bin/env bash
# ori-generate: generate docker-compose.yml from manifest.yaml
# Usage: ./generate-docker-compose.sh <scenario-id>
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
  echo "ERROR: scenario-id required" >&2
  exit 1
fi

SCENARIO_DIR=".ori/scenarios/$ID"
if [[ ! -f "$SCENARIO_DIR/manifest.yaml" ]]; then
  echo "ERROR: scenario not found: $SCENARIO_DIR/manifest.yaml" >&2
  exit 1
fi

# Generate docker-compose.yml using Python
ID="$ID" python3 << 'PYEOF'
import yaml
import sys
import os

scenario_id = os.environ.get('ID', '')
if not scenario_id:
    print("ERROR: scenario-id required", file=sys.stderr)
    sys.exit(1)

scenario_dir = f".ori/scenarios/{scenario_id}"
manifest_path = f"{scenario_dir}/manifest.yaml"

with open(manifest_path, 'r') as f:
    manifest = yaml.safe_load(f)

if 'infrastructure' not in manifest or 'services' not in manifest['infrastructure']:
    print("ERROR: manifest.yaml does not contain infrastructure.services", file=sys.stderr)
    sys.exit(1)

services = manifest['infrastructure']['services']
volumes = manifest.get('volumes', {})

docker_compose = {
    'version': '3.8',
    'services': {}
}

for service_name, service_config in services.items():
    service = {}
    if 'image' in service_config:
        service['image'] = service_config['image']
    if 'ports' in service_config:
        service['ports'] = service_config['ports']
    if 'environment' in service_config:
        service['environment'] = service_config['environment']
    if 'volumes' in service_config:
        service['volumes'] = service_config['volumes']
    docker_compose['services'][service_name] = service

if volumes:
    docker_compose['volumes'] = volumes

output_path = f"{scenario_dir}/docker-compose.yml"
with open(output_path, 'w') as f:
    yaml.dump(docker_compose, f, default_flow_style=False, sort_keys=False)

print(f"Generated: {output_path}")
PYEOF