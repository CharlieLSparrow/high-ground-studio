#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-attach-proxy-smoke"
SHORT_PROXY="$SMOKE_DIR/too_short_test_audio_proxy.m4a"
VALID_PROXY="$SMOKE_DIR/full_length_test_audio_proxy.m4a"

usage() {
  cat <<'USAGE'
Smoke Episode 1 attach-proxy recovery path.

Usage:
  script/smoke_episode1_attach_proxy.sh [--no-build]

What this proves:
  - A too-short proxy is rejected and does not make a whole source lane ready.
  - A duration-matching local audio proxy can be attached to a whole source lane.
  - The original source path remains unchanged.
  - The proxy is copied into Quipsly's deterministic local proxy vault.
  - Audio readiness improves without pretending the unreadable original WAV is fixed.
  - The smoke removes only its own generated test proxy and restores the Episode 1 baseline.

If a real audio proxy already exists for the target lane, this smoke exits cleanly
without overwriting it.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-attach-proxy-build.log
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

python3 - "$BASE_URL" "$PACKET_PATH" "$MEDIA_DIR" "$SHORT_PROXY" "$VALID_PROXY" <<'PY'
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
short_proxy = Path(sys.argv[4])
valid_proxy = Path(sys.argv[5])
target_lane_name = "Charlie Audio - First Pod Ever.wav"

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
    with urllib.request.urlopen(f"{base_url}{path}", timeout=8) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}

def load_baseline():
    request(f"/premiere_packet?path={quote(packet_path)}")
    for lane_name, lane_path in lane_paths.items():
        request(f"/relink_lane?lane_id={quote(lane_name)}&path={quote(lane_path)}&queue_proxy=0")
    request("/playback?mode=edit&action=set")
    time.sleep(0.4)
    return request("/state")

def find_lane(state, name):
    for lane in state.get("lanes", []):
        if lane.get("name") == name:
            return lane
    return None

def lane_signature(lane):
    return {
        "name": lane.get("name", ""),
        "duration": lane.get("duration", 0),
        "sourceOffset": lane.get("sourceOffset", 0),
        "sourcePath": lane.get("sourcePath", ""),
        "mediaKind": lane.get("mediaKind", ""),
        "role": lane.get("role", ""),
        "trackIds": lane.get("trackIds", []),
    }

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
        timeout=90,
    )

def wait_for_lane_readiness(label, timeout=8):
    deadline = time.time() + timeout
    state = {}
    lane = None
    while time.time() < deadline:
        state = request("/state")
        lane = find_lane(state, target_lane_name)
        if lane and lane.get("sourceReadiness") == label:
            return state, lane
        time.sleep(0.25)
    return state, lane

def remove_generated_proxy(path, existed_before):
    if path and not existed_before and os.path.exists(path):
        os.remove(path)

errors = []
baseline = load_baseline()
target_before = find_lane(baseline, target_lane_name)
if not target_before:
    errors.append(f"Could not find target lane {target_lane_name!r}")
    print(json.dumps({"attachProxyReady": False, "errors": errors}, indent=2))
    sys.exit(1)

planned_path = target_before.get("playbackPath", "")
real_proxy_already_ready = target_before.get("sourceReadiness") == "Audio proxy ready" and planned_path and os.path.exists(planned_path)
if real_proxy_already_ready:
    print(json.dumps({
        "attachProxyReady": True,
        "alreadyHadRealProxy": True,
        "targetLane": target_lane_name,
        "playbackPath": planned_path,
    }, indent=2))
    sys.exit(0)

expected_duration = float(target_before.get("duration") or 0)
if expected_duration <= 10:
    errors.append(f"Target lane duration is too short for attach-proxy production validation: {expected_duration!r}")
    print(json.dumps({"attachProxyReady": False, "errors": errors}, indent=2))
    sys.exit(1)

make_silent_proxy(short_proxy, 1)
make_silent_proxy(valid_proxy, expected_duration + 0.5)

proxy_existed_before = bool(planned_path and os.path.exists(planned_path))

request(f"/attach_proxy?lane_id={quote(target_lane_name)}&path={quote(short_proxy)}")
short_state, short_lane = wait_for_lane_readiness("Audio proxy blocked")
if not short_lane:
    errors.append("Target lane disappeared after short attach_proxy")
elif short_lane.get("sourceReadiness") != "Audio proxy blocked":
    errors.append(f"too-short proxy: expected Audio proxy blocked, got {short_lane.get('sourceReadiness')!r}")
elif "too short" not in short_lane.get("sourceReadinessDetail", "").lower():
    errors.append(f"too-short proxy detail should explain duration mismatch, got {short_lane.get('sourceReadinessDetail')!r}")
if short_state.get("audioReadyCount") != baseline.get("audioReadyCount"):
    errors.append("too-short proxy should not increase audioReadyCount")

short_copied_path = short_lane.get("playbackPath", "") if short_lane else planned_path
remove_generated_proxy(short_copied_path, proxy_existed_before)
baseline = load_baseline()
target_before = find_lane(baseline, target_lane_name)

request(f"/attach_proxy?lane_id={quote(target_lane_name)}&path={quote(valid_proxy)}")
after, target_after = wait_for_lane_readiness("Audio proxy ready", timeout=10)

if not target_after:
    errors.append("Target lane disappeared after valid attach_proxy")
else:
    if target_after.get("sourceReadiness") != "Audio proxy ready":
        errors.append(f"sourceReadiness: expected Audio proxy ready, got {target_after.get('sourceReadiness')!r}")
    if target_after.get("sourcePath") != target_before.get("sourcePath"):
        errors.append("sourcePath changed; attach-proxy must preserve the original whole source")
    if target_after.get("mediaKind") != "audio":
        errors.append(f"mediaKind: expected audio, got {target_after.get('mediaKind')!r}")
    if "/Library/Application Support/Quipsly/MediaVault/proxy/" not in target_after.get("playbackPath", ""):
        errors.append(f"playbackPath: expected Quipsly proxy vault path, got {target_after.get('playbackPath')!r}")
    if not os.path.exists(target_after.get("playbackPath", "")):
        errors.append("attached proxy playbackPath does not exist")
    if lane_signature(target_after) != lane_signature(target_before):
        errors.append("lane identity/source signature changed beyond proxy readiness")
    if after.get("audioReadyCount", 0) != baseline.get("audioReadyCount", 0) + 1:
        errors.append(f"audioReadyCount: expected {baseline.get('audioReadyCount', 0) + 1}, got {after.get('audioReadyCount')!r}")
    if after.get("audioBlockedCount", 0) != max(0, baseline.get("audioBlockedCount", 0) - 1):
        errors.append(f"audioBlockedCount: expected {max(0, baseline.get('audioBlockedCount', 0) - 1)}, got {after.get('audioBlockedCount')!r}")
    if after.get("productionReady") is True:
        errors.append("productionReady should remain false with the second audio lane still blocked")

copied_proxy_path = target_after.get("playbackPath", "") if target_after else ""
remove_generated_proxy(copied_proxy_path, proxy_existed_before)

restored = load_baseline()
target_restored = find_lane(restored, target_lane_name)
if not target_restored:
    errors.append("Target lane missing after baseline restore")
else:
    if target_restored.get("sourceReadiness") == "Audio proxy ready" and not proxy_existed_before:
        errors.append("Baseline restore still sees the generated test proxy as ready")

summary = {
    "attachProxyReady": not errors,
    "alreadyHadRealProxy": False,
    "targetLane": target_lane_name,
    "expectedDuration": expected_duration,
    "shortProxyRejected": short_lane.get("sourceReadiness") == "Audio proxy blocked" if short_lane else False,
    "before": {
        "sourceReadiness": target_before.get("sourceReadiness"),
        "audioReadyCount": baseline.get("audioReadyCount"),
        "audioBlockedCount": baseline.get("audioBlockedCount"),
        "productionReady": baseline.get("productionReady"),
    },
    "after": {
        "sourceReadiness": target_after.get("sourceReadiness") if target_after else "",
        "audioReadyCount": after.get("audioReadyCount"),
        "audioBlockedCount": after.get("audioBlockedCount"),
        "productionReady": after.get("productionReady"),
        "playbackPath": copied_proxy_path,
    },
    "restored": {
        "sourceReadiness": target_restored.get("sourceReadiness") if target_restored else "",
        "audioReadyCount": restored.get("audioReadyCount"),
        "audioBlockedCount": restored.get("audioBlockedCount"),
        "productionReady": restored.get("productionReady"),
    },
    "errors": errors,
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 attach-proxy smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 attach-proxy smoke PASSED.")
PY
