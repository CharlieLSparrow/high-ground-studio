#!/usr/bin/env bash
set -euo pipefail

AGENT_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-/Users/wall-e/Dev/high-ground-studio/content/quipsly/premiere-imports/episode-1.json}"
MODE="${1:---charlie-video-only}"

curl_json() {
  curl -m 10 -fsS -G "$@"
  printf '\n'
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing expected Episode 1 media file: $file" >&2
    exit 1
  fi
}

if [[ ! -f "$PACKET_PATH" ]]; then
  echo "Missing Episode 1 rescue packet: $PACKET_PATH" >&2
  exit 1
fi

case "$MODE" in
  --charlie-video-only|--all)
    ;;
  *)
    cat >&2 <<USAGE
Usage: $0 [--charlie-video-only|--all]

Default is --charlie-video-only because the safe live proof is one huge camera lane, one audio relink, a prebuilt proxy, and unchanged decisions.
Set EPISODE1_MEDIA_DIR if the external drive path differs.
USAGE
    exit 2
    ;;
esac

require_file "$MEDIA_DIR/MVI_3999.MP4"
require_file "$MEDIA_DIR/First Pod Ever.wav"
printf 'Loading Episode 1 whole-lane rescue packet...\n'
curl_json "$AGENT_URL/premiere_packet" --data-urlencode "path=$PACKET_PATH"

printf 'Relinking Charlie whole source video. Raw stays external; QuipslyStudio will use the deterministic proxy when present.\n'
curl_json "$AGENT_URL/relink_lane" \
  --data-urlencode "lane_id=Charlie Camera - MVI_3999.MP4" \
  --data-urlencode "path=$MEDIA_DIR/MVI_3999.MP4" \
  --data-urlencode "queue_proxy=0"

printf 'Relinking Charlie external audio without copying raw audio.\n'
curl_json "$AGENT_URL/relink_lane" \
  --data-urlencode "lane_id=Charlie Audio - First Pod Ever.wav" \
  --data-urlencode "path=$MEDIA_DIR/First Pod Ever.wav" \
  --data-urlencode "queue_proxy=0"

if [[ "$MODE" == "--all" ]]; then
  require_file "$MEDIA_DIR/NewHomerExport.MP4"
  require_file "$MEDIA_DIR/HomerAudio.wav"
  cat >&2 <<WARNING
WARNING: --all relinks the second huge camera lane too. Build its proxy first with script/create_proxy_for_file.py for proxy-first playback.
WARNING
  curl_json "$AGENT_URL/relink_lane" \
    --data-urlencode "lane_id=Homer Camera - NewHomerExport.MP4" \
    --data-urlencode "path=$MEDIA_DIR/NewHomerExport.MP4" \
    --data-urlencode "queue_proxy=0"
  curl_json "$AGENT_URL/relink_lane" \
    --data-urlencode "lane_id=Homer Audio - HomerAudio.wav" \
    --data-urlencode "path=$MEDIA_DIR/HomerAudio.wav" \
    --data-urlencode "queue_proxy=0"
fi

printf 'Requesting current editor state...\n'
curl_json "$AGENT_URL/state"
