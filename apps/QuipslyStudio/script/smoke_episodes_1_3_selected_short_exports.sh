#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_ROOT="${QUIPSLY_MULTI_SHORT_EXPORT_SMOKE_DIR:-/tmp/quipslystudio-episodes-1-3-short-exports}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Smoke selected 9:16 short exports for Episodes 1-3.

Usage:
  script/smoke_episodes_1_3_selected_short_exports.sh [--no-build] [--output <directory>]

This proves each saved native session can:
  - load in the running QuipslyStudio app,
  - report productionReady=true,
  - create a temporary selected-short recipe over whole proxy-backed lanes,
  - export a non-empty 9:16 derivative MP4,
  - preserve the whole-source-lane architecture.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      ;;
    --output)
      OUTPUT_ROOT="${2:-}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -z "$OUTPUT_ROOT" ]]; then
  echo "Missing output directory." >&2
  usage >&2
  exit 2
fi

mkdir -p "$OUTPUT_ROOT"

if [[ "$NO_BUILD" == "1" ]]; then
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
else
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-episodes-1-3-short-exports-build.log
fi

sessions=(
  "episode-1-premiere-rescue"
  "episode-2-native-proof"
  "episode-3-premiere-rescue"
)

for session in "${sessions[@]}"; do
  safe_session="${session//[^A-Za-z0-9._-]/-}"
  "$ROOT_DIR/script/smoke_selected_short_export.sh" \
    --no-build \
    --session "$session" \
    --output "$OUTPUT_ROOT/$safe_session"
done

python3 - "$OUTPUT_ROOT" <<'PY'
import json
import os
import sys
root = sys.argv[1]
outputs = []
for dirpath, _, filenames in os.walk(root):
    for filename in filenames:
        if filename.endswith('.mp4'):
            path = os.path.join(dirpath, filename)
            outputs.append({
                'path': path,
                'sizeBytes': os.path.getsize(path),
            })
outputs.sort(key=lambda item: item['path'])
print(json.dumps({
    'status': 'pass',
    'episodeCount': 3,
    'outputRoot': root,
    'outputCount': len(outputs),
    'outputs': outputs,
    'architectureInvariant': 'Episodes 1-3 each export a selected 9:16 derivative from metadata recipes over whole proxy-backed source lanes.'
}, indent=2, sort_keys=True))
PY
