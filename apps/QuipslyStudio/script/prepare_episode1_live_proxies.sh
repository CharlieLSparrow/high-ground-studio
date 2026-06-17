#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
PROXY_TIMEOUT_SECONDS="${EPISODE1_PROXY_TIMEOUT_SECONDS:-0}"

GENERATE=0
FORCE=0
LOAD_EDITOR=0
PRINT_JSON=0

usage() {
  cat <<'USAGE'
Prepare Episode 1 live media for QuipslyStudio, proxy-first.

Usage:
  script/prepare_episode1_live_proxies.sh [--generate] [--force] [--load-editor] [--json]

Default mode is a safe plan only. It checks the exact whole Episode 1 source
manifest and prints deterministic proxy paths. It never scans Premiere clip
lists and never creates chopped timeline media.

Options:
  --generate     Generate any missing deterministic proxies.
  --force        Regenerate proxies even if they already exist.
  --load-editor  Load Episode 1 packet and relink exact whole lanes to these
                 sources. Existing deterministic proxies are used for preview.
  --json         Print one JSON record per source/proxy entry.

Environment overrides:
  EPISODE1_MEDIA_DIR=/Volumes/My Passport/Episode 1
  EPISODE1_PACKET_PATH=/absolute/path/to/episode-1.json
  EPISODE1_PROXY_TIMEOUT_SECONDS=0
  QUIPSLY_AGENT_URL=http://127.0.0.1:8080

Invariant:
  Whole source files are the lanes. Proxies are the playback material. SHOW/SKIP
  decisions remain metadata overlays. This script does not cut, split, trim, or
  delete source media.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --generate)
      GENERATE=1
      ;;
    --force)
      FORCE=1
      ;;
    --load-editor)
      LOAD_EDITOR=1
      ;;
    --json)
      PRINT_JSON=1
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

get() {
  curl --fail --silent --show-error "$BASE_URL$1"
  printf '\n'
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing expected whole Episode 1 source: $path" >&2
    exit 1
  fi
}

proxy_plan() {
  local source="$1"
  if [[ "$PRINT_JSON" == "1" ]]; then
    "$ROOT_DIR/script/create_proxy_for_file.py" "$source" --dry-run --json
  else
    "$ROOT_DIR/script/create_proxy_for_file.py" "$source" --dry-run
  fi
}

create_proxy() {
  local source="$1"
  local args=("$source")
  if [[ "$PROXY_TIMEOUT_SECONDS" != "0" && -n "$PROXY_TIMEOUT_SECONDS" ]]; then
    args+=(--timeout "$PROXY_TIMEOUT_SECONDS")
  fi
  if [[ "$FORCE" == "1" ]]; then
    args+=(--force)
  fi
  if [[ "$PRINT_JSON" == "1" ]]; then
    args+=(--json)
  fi
  "$ROOT_DIR/script/create_proxy_for_file.py" "${args[@]}"
}

entries=(
  "Charlie Camera - MVI_3999.MP4|MVI_3999.MP4"
  "Homer Camera - NewHomerExport.MP4|NewHomerExport.MP4"
  "Reference Clip - There is no try.mp4|There is no try.mp4"
  "Charlie Audio - First Pod Ever.wav|First Pod Ever.wav"
  "Homer Audio - HomerAudio.wav|HomerAudio.wav"
)

require_file "$PACKET_PATH"

if [[ "$PRINT_JSON" != "1" ]]; then
  echo "Episode 1 live proxy manifest"
  echo "Media:  $MEDIA_DIR"
  echo "Packet: $PACKET_PATH"
  echo
fi

for entry in "${entries[@]}"; do
  IFS='|' read -r lane_name filename <<<"$entry"
  source="$MEDIA_DIR/$filename"
  require_file "$source"
  if [[ "$PRINT_JSON" != "1" ]]; then
    echo "Whole lane: $lane_name"
    echo "  source: $source"
    echo -n "  proxy:  "
  fi
  if [[ "$GENERATE" == "1" ]]; then
    create_proxy "$source"
  else
    proxy_plan "$source"
  fi
done

if [[ "$LOAD_EDITOR" == "1" ]]; then
  if [[ "$PRINT_JSON" != "1" ]]; then
    echo
    echo "Loading Episode 1 as whole lanes and relinking exact sources..."
  fi
  get "/premiere_packet?path=$(urlencode "$PACKET_PATH")" >/dev/null
  for entry in "${entries[@]}"; do
    IFS='|' read -r lane_name filename <<<"$entry"
    source="$MEDIA_DIR/$filename"
    get "/relink_lane?lane_id=$(urlencode "$lane_name")&path=$(urlencode "$source")&queue_proxy=0" >/dev/null
  done
  get "/playback?mode=edit&action=set" >/dev/null
  state_path="${TMPDIR:-/tmp}/quipslystudio-episode1-live-media-state.json"
  get "/state" > "$state_path"
  if [[ "$PRINT_JSON" == "1" ]]; then
    cat "$state_path"
  else
    python3 - "$state_path" <<'PY'
import json
import sys
from pathlib import Path

state = json.loads(Path(sys.argv[1]).read_text())
summary = {
    "visualRoughCutReady": state.get("visualRoughCutReady"),
    "visualRoughCutDetail": state.get("visualRoughCutDetail"),
    "productionReady": state.get("productionReady"),
    "productionReadinessDetail": state.get("productionReadinessDetail"),
    "laneCount": state.get("laneCount"),
    "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount"),
    "sourcePlayerCount": state.get("sourcePlayerCount"),
    "videoProxyReadyCount": state.get("videoProxyReadyCount"),
    "audioReadyCount": state.get("audioReadyCount"),
    "audioBlockedCount": state.get("audioBlockedCount"),
    "showDecisionCount": state.get("showDecisionCount"),
    "skipDecisionCount": state.get("skipDecisionCount"),
    "validRangeCount": state.get("validRangeCount"),
    "lanes": [
        {
            "name": lane.get("name"),
            "kind": lane.get("mediaKind"),
            "readiness": lane.get("sourceReadiness"),
            "playbackPath": lane.get("playbackPath"),
        }
        for lane in state.get("lanes", [])
    ],
}
print(json.dumps(summary, indent=2))
PY
  fi
elif [[ "$PRINT_JSON" != "1" ]]; then
  echo
  echo "Plan only. To generate missing proxies and load the editor:"
  echo "  ./script/prepare_episode1_live_proxies.sh --generate --load-editor"
fi
