#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
STAGING_DIR="${EPISODE1_AUDIO_STAGING_DIR:-$HOME/Movies/Quipsly/Staging/Episode 1 Audio}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
PROBE_TIMEOUT_SECONDS="${EPISODE1_AUDIO_PROBE_TIMEOUT_SECONDS:-20}"

COPY=0
RELINK=0
RETRY=0

usage() {
  cat <<'USAGE'
Stage Episode 1 audio originals for proxy generation.

Usage:
  script/stage_episode1_audio_for_proxy.sh [--copy] [--relink] [--retry]

Default mode is a dry run. It checks the two expected Episode 1 WAV files and
prints the exact safe next action.

Options:
  --copy     Copy whole WAV originals into a stable local staging folder.
  --relink   Ask the running QuipslyMac app to match/relink from the staging folder.
  --retry    Ask the running QuipslyMac app to retry pending proxy generation.

Environment overrides:
  EPISODE1_MEDIA_DIR=/Volumes/My Passport/Episode 1
  EPISODE1_AUDIO_STAGING_DIR="$HOME/Movies/Quipsly/Staging/Episode 1 Audio"
  EPISODE1_AUDIO_PROBE_TIMEOUT_SECONDS=20
  QUIPSLY_AGENT_URL=http://127.0.0.1:8080

Important:
  - This stages whole audio originals only.
  - It does not create chopped clips.
  - It does not touch SHOW/SKIP decisions.
  - The editor should still preview from generated .m4a proxies.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --copy)
      COPY=1
      ;;
    --relink)
      RELINK=1
      ;;
    --retry)
      RETRY=1
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

probe_read() {
  local path="$1"
  python3 - "$path" "$PROBE_TIMEOUT_SECONDS" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

path = Path(sys.argv[1])
timeout = float(sys.argv[2])

result = {
    "path": str(path),
    "exists": path.exists(),
    "sizeBytes": None,
    "readable": False,
    "error": "",
}

try:
    if result["exists"]:
        result["sizeBytes"] = path.stat().st_size
        probe = subprocess.run(
            ["/usr/bin/head", "-c", "16", str(path)],
            timeout=timeout,
            capture_output=True,
            check=False,
        )
        if probe.returncode == 0:
            result["readable"] = True
        else:
            error = probe.stderr.decode("utf-8", errors="replace").strip()
            result["error"] = error or f"head exited {probe.returncode}"
except subprocess.TimeoutExpired:
    result["error"] = f"Timed out after {timeout:g}s reading first bytes"
except Exception as error:
    result["error"] = f"{type(error).__name__}: {error}"

print(json.dumps(result, sort_keys=True))
sys.exit(0 if result["readable"] else 1)
PY
}

copy_whole_file() {
  local source="$1"
  local destination="$2"
  mkdir -p "$(dirname "$destination")"

  if [[ -f "$destination" ]]; then
    local source_size destination_size
    source_size="$(stat -f%z "$source" 2>/dev/null || echo 0)"
    destination_size="$(stat -f%z "$destination" 2>/dev/null || echo -1)"
    if [[ "$source_size" == "$destination_size" && "$source_size" != "0" ]]; then
      echo "Already staged: $destination"
      return 0
    fi
  fi

  echo "Copying whole source:"
  echo "  from: $source"
  echo "  to:   $destination"
  /usr/bin/rsync --partial --progress "$source" "$destination"
}

files=("First Pod Ever.wav" "HomerAudio.wav")

echo "Episode 1 audio staging preflight"
echo "Source:  $SOURCE_DIR"
echo "Staging: $STAGING_DIR"
echo

blocked=0
for filename in "${files[@]}"; do
  source_path="$SOURCE_DIR/$filename"
  destination_path="$STAGING_DIR/$filename"
  echo "Checking $filename"
  if ! probe_json="$(probe_read "$source_path")"; then
    echo "$probe_json"
    blocked=$((blocked + 1))
    continue
  fi
  echo "$probe_json"

  if [[ "$COPY" == "1" ]]; then
    copy_whole_file "$source_path" "$destination_path"
  fi
done

if [[ "$blocked" -gt 0 ]]; then
  echo
  echo "Blocked: $blocked audio source file(s) are not readable from the current source folder."
  echo "If the external drive is still copying/downloading/spinning up, wait and rerun this script."
  echo "If the files are readable from another location, set EPISODE1_MEDIA_DIR to that folder."
  exit 2
fi

if [[ "$COPY" != "1" ]]; then
  echo
  echo "Dry run complete. To stage whole audio originals:"
  echo "  ./script/stage_episode1_audio_for_proxy.sh --copy --relink --retry"
  exit 0
fi

if [[ "$RELINK" == "1" ]]; then
  echo
  echo "Relinking whole audio lanes from staging folder..."
  get "/match_folder?path=$(urlencode "$STAGING_DIR")" >/dev/null
fi

if [[ "$RETRY" == "1" ]]; then
  echo "Retrying pending proxies..."
  get "/retry_proxies" >/dev/null
fi

echo
echo "Audio staging path is ready. Rerun:"
echo "  ./script/preflight_episode1_media.sh"
echo "  ./script/smoke_episode1_production_ready.sh --no-build"
