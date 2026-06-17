#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-production-gate-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 production gate mechanics with temporary full-length audio proxies.

Usage:
  script/smoke_episode1_production_gate.sh [--no-build]

What this proves:
  - Episode 1 remains not production-ready with missing audio proxies.
  - Full-duration audio proxies attached to both whole audio lanes make the
    editor's technical production gate go green.
  - Source paths, lane identities, video proxy paths, and edit decisions remain
    unchanged.
  - Removing the temporary proxies and restoring the packet returns Episode 1 to
    the real current blocked state.

This does NOT prove the real episode audio is usable. The smoke uses generated
silent test proxies so it can test gate mechanics without modifying originals.
The real production gate remains blocked until real recovered/generated audio
proxies are attached.
USAGE
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" != "--no-build" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-production-gate-build.log
else
  curl --fail --silent --show-error "$BASE_URL/health" >/dev/null
fi

require_file "$PACKET_PATH"
require_file "$MEDIA_DIR/MVI_3999.MP4"
require_file "$MEDIA_DIR/NewHomerExport.MP4"
require_file "$MEDIA_DIR/First Pod Ever.wav"
require_file "$MEDIA_DIR/HomerAudio.wav"
require_file "$MEDIA_DIR/There is no try.mp4"

mkdir -p "$SMOKE_DIR"

python3 - "$BASE_URL" "$PACKET_PATH" "$MEDIA_DIR" "$SMOKE_DIR" <<'PY'
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1]
packet_path = sys.argv[2]
media_dir = sys.argv[3]
smoke_dir = Path(sys.argv[4])

audio_lane_names = [
    "Charlie Audio - First Pod Ever.wav",
    "Homer Audio - HomerAudio.wav",
]

lane_paths = {
    "Charlie Camera - MVI_3999.MP4": f"{media_dir}/MVI_3999.MP4",
    "Homer Camera - NewHomerExport.MP4": f"{media_dir}/NewHomerExport.MP4",
    "Charlie Audio - First Pod Ever.wav": f"{media_dir}/First Pod Ever.wav",
    "Homer Audio - HomerAudio.wav": f"{media_dir}/HomerAudio.wav",
    "Reference Clip - There is no try.mp4": f"{media_dir}/There is no try.mp4",
}

def quote(value):
    return urllib.parse.quote(str(value), safe="")

def request(path):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=10) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}

def load_baseline():
    request(f"/premiere_packet?path={quote(packet_path)}")
    for lane_name, lane_path in lane_paths.items():
        request(f"/relink_lane?lane_id={quote(lane_name)}&path={quote(lane_path)}&queue_proxy=0")
    request("/playback?mode=edit&action=set")
    time.sleep(0.5)
    return request("/state")

def find_lane(state, name):
    for lane in state.get("lanes", []):
        if lane.get("name") == name:
            return lane
    return None

def lane_signature(state):
    return [
        {
            "name": lane.get("name", ""),
            "duration": lane.get("duration", 0),
            "sourceOffset": lane.get("sourceOffset", 0),
            "sourcePath": lane.get("sourcePath", ""),
            "mediaKind": lane.get("mediaKind", ""),
            "role": lane.get("role", ""),
            "trackIds": lane.get("trackIds", []),
            "activeCount": lane.get("activeCount", 0),
            "cutCount": lane.get("cutCount", 0),
        }
        for lane in state.get("lanes", [])
    ]

def video_proxy_signature(state):
    return [
        {
            "name": lane.get("name", ""),
            "playbackPath": lane.get("playbackPath", ""),
            "sourceReadiness": lane.get("sourceReadiness", ""),
        }
        for lane in state.get("lanes", [])
        if lane.get("mediaKind") == "video"
    ]

def probe_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=20,
        check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])

def make_silent_proxy(path, duration):
    if path.exists():
        try:
            existing = probe_duration(path)
            if existing + 2 >= duration:
                return
        except Exception:
            pass
        path.unlink()

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=stereo",
            "-t",
            str(duration),
            "-c:a",
            "aac",
            "-b:a",
            "24k",
            "-movflags",
            "+faststart",
            str(path),
        ],
        check=True,
        timeout=120,
    )

def wait_for(predicate, timeout=20):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = request("/state")
        if predicate(last):
            return last
        time.sleep(0.4)
    return last

def remove_if_generated(path, existed_before):
    if path and not existed_before and os.path.exists(path):
        os.remove(path)

errors = []
baseline = load_baseline()

if baseline.get("productionReady") is True:
    print(json.dumps({
        "productionGateReady": True,
        "alreadyProductionReady": True,
        "productionReadinessDetail": baseline.get("productionReadinessDetail"),
    }, indent=2))
    sys.exit(0)

baseline_lane_signature = lane_signature(baseline)
baseline_video_signature = video_proxy_signature(baseline)
expected_audio = {}
existing_proxy_by_lane = {}
generated_proxy_paths = {}

for lane_name in audio_lane_names:
    lane = find_lane(baseline, lane_name)
    if not lane:
        errors.append(f"Missing audio lane {lane_name!r}")
        continue

    duration = float(lane.get("duration") or 0)
    if duration <= 10:
        errors.append(f"{lane_name}: expected whole-lane duration > 10s, got {duration!r}")
        continue

    playback_path = lane.get("playbackPath", "")
    existing_proxy_by_lane[lane_name] = bool(playback_path and os.path.exists(playback_path))
    proxy_path = smoke_dir / (lane_name.replace(" ", "_").replace("/", "_") + ".m4a")
    make_silent_proxy(proxy_path, duration + 0.5)
    generated_proxy_paths[lane_name] = str(proxy_path)
    expected_audio[lane_name] = {
        "sourcePath": lane.get("sourcePath", ""),
        "duration": duration,
        "baselinePlaybackPath": playback_path,
    }

if errors:
    print(json.dumps({"productionGateReady": False, "errors": errors}, indent=2))
    sys.exit(1)

for lane_name, proxy_path in generated_proxy_paths.items():
    request(f"/attach_proxy?lane_id={quote(lane_name)}&path={quote(proxy_path)}")

after = wait_for(
    lambda state: state.get("productionReady") is True
    and state.get("audioReadyCount") == 2
    and state.get("audioBlockedCount") == 0,
    timeout=25,
)

if after.get("productionReady") is not True:
    errors.append(f"productionReady: expected true after both full-length proxies, got {after.get('productionReady')!r}: {after.get('productionReadinessDetail')!r}")
if after.get("audioReadyCount") != 2:
    errors.append(f"audioReadyCount: expected 2, got {after.get('audioReadyCount')!r}")
if after.get("audioBlockedCount") != 0:
    errors.append(f"audioBlockedCount: expected 0, got {after.get('audioBlockedCount')!r}")
if after.get("videoProxyReadyCount") != baseline.get("videoProxyReadyCount"):
    errors.append("videoProxyReadyCount changed while attaching audio proxies")
if lane_signature(after) != baseline_lane_signature:
    errors.append("lane/source/edit-decision signature changed while attaching audio proxies")
if video_proxy_signature(after) != baseline_video_signature:
    errors.append("video proxy signature changed while attaching audio proxies")

attached_playback_paths = {}
for lane_name in audio_lane_names:
    lane = find_lane(after, lane_name)
    if not lane:
        errors.append(f"{lane_name}: missing after attach")
        continue
    attached_playback_paths[lane_name] = lane.get("playbackPath", "")
    if lane.get("sourcePath") != expected_audio[lane_name]["sourcePath"]:
        errors.append(f"{lane_name}: sourcePath changed")
    if lane.get("sourceReadiness") != "Audio proxy ready":
        errors.append(f"{lane_name}: expected Audio proxy ready, got {lane.get('sourceReadiness')!r}")
    if "/Library/Application Support/Quipsly/MediaVault/proxy/" not in lane.get("playbackPath", ""):
        errors.append(f"{lane_name}: expected deterministic proxy vault playback path, got {lane.get('playbackPath')!r}")

for lane_name, playback_path in attached_playback_paths.items():
    remove_if_generated(playback_path, existing_proxy_by_lane.get(lane_name, False))

restored = load_baseline()
if restored.get("productionReady") is True:
    errors.append("restored baseline should not stay production-ready after generated proxies were removed")
if restored.get("audioReadyCount") != baseline.get("audioReadyCount"):
    errors.append(f"restored audioReadyCount: expected {baseline.get('audioReadyCount')}, got {restored.get('audioReadyCount')}")
if restored.get("audioBlockedCount") != baseline.get("audioBlockedCount"):
    errors.append(f"restored audioBlockedCount: expected {baseline.get('audioBlockedCount')}, got {restored.get('audioBlockedCount')}")
if lane_signature(restored) != baseline_lane_signature:
    errors.append("restored lane/source/edit-decision signature differs from baseline")

summary = {
    "productionGateReady": not errors,
    "usedGeneratedSilentProxies": True,
    "realEpisodeAudioReady": False,
    "before": {
        "productionReady": baseline.get("productionReady"),
        "productionReadinessDetail": baseline.get("productionReadinessDetail"),
        "audioReadyCount": baseline.get("audioReadyCount"),
        "audioBlockedCount": baseline.get("audioBlockedCount"),
        "videoProxyReadyCount": baseline.get("videoProxyReadyCount"),
    },
    "afterBothProxies": {
        "productionReady": after.get("productionReady"),
        "productionReadinessDetail": after.get("productionReadinessDetail"),
        "audioReadyCount": after.get("audioReadyCount"),
        "audioBlockedCount": after.get("audioBlockedCount"),
        "videoProxyReadyCount": after.get("videoProxyReadyCount"),
    },
    "restored": {
        "productionReady": restored.get("productionReady"),
        "productionReadinessDetail": restored.get("productionReadinessDetail"),
        "audioReadyCount": restored.get("audioReadyCount"),
        "audioBlockedCount": restored.get("audioBlockedCount"),
    },
    "errors": errors,
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 production gate smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 production gate smoke PASSED.")
print("Note: this proves gate mechanics with generated silent proxies; real Episode 1 audio still needs real recovered/generated proxies.")
PY
