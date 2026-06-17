#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-package-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 production package mechanics with generated silent proxies.

Usage:
  script/smoke_episode1_production_package_mechanics.sh [--no-build]

What this proves:
  - The package exporter blocks without production audio readiness.
  - Generated full-length silent audio proxies make the package export path green.
  - The package exporter emits both 16:9 and 9:16 MP4s with audio streams.
  - The editor state is restored to the real current blocked state afterward.

This proves mechanics only. Real production remains blocked until real Episode 1
audio proxies are recovered/generated/attached.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-package-build.log
else
  curl --fail --silent --show-error "$BASE_URL/health" >/dev/null
fi

require_file "$PACKET_PATH"
require_file "$MEDIA_DIR/MVI_3999.MP4"
require_file "$MEDIA_DIR/NewHomerExport.MP4"
require_file "$MEDIA_DIR/First Pod Ever.wav"
require_file "$MEDIA_DIR/HomerAudio.wav"
require_file "$MEDIA_DIR/There is no try.mp4"

rm -rf "$SMOKE_DIR"
mkdir -p "$SMOKE_DIR"

python3 - "$ROOT_DIR" "$BASE_URL" "$PACKET_PATH" "$MEDIA_DIR" "$SMOKE_DIR" <<'PY'
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse
import urllib.request

root_dir = Path(sys.argv[1])
base_url = sys.argv[2]
packet_path = sys.argv[3]
media_dir = sys.argv[4]
smoke_dir = Path(sys.argv[5])

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
    with urllib.request.urlopen(f"{base_url}{path}", timeout=12) as response:
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


def make_silent_proxy(path, duration):
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
        timeout=180,
    )


def wait_for(predicate, timeout=30):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = request("/state")
        if predicate(last):
            return last
        time.sleep(0.4)
    return last


def run_package(args):
    result = subprocess.run(
        [str(root_dir / "script" / "export_episode1_production_package.sh"), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=180,
        check=False,
    )
    return result


def has_stream(summary, kind):
    return any(stream.get("codec_type") == kind for stream in summary.get("probe", {}).get("streams", []))


def video_size(summary):
    for stream in summary.get("probe", {}).get("streams", []):
        if stream.get("codec_type") == "video":
            return stream.get("width"), stream.get("height")
    return None, None


def remove_if_generated(path, existed_before):
    if path and not existed_before and os.path.exists(path):
        os.remove(path)


errors = []
baseline = load_baseline()
baseline_signature = lane_signature(baseline)

blocked = run_package([
    "--output-dir",
    str(smoke_dir / "blocked"),
    "--proof-duration",
    "4",
    "--json",
])
if blocked.returncode == 0:
    errors.append("production package should block before audio proxies are attached")
else:
    try:
        blocked_payload = json.loads(blocked.stdout)
        if blocked_payload.get("status") != "blocked":
            errors.append(f"blocked package status should be blocked, got {blocked_payload.get('status')!r}")
    except Exception as error:
        errors.append(f"blocked package did not return JSON: {type(error).__name__}: {error}")

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

if errors:
    print(json.dumps({"productionPackageMechanicsReady": False, "errors": errors}, indent=2))
    sys.exit(1)

for lane_name, proxy_path in generated_proxy_paths.items():
    request(f"/attach_proxy?lane_id={quote(lane_name)}&path={quote(proxy_path)}")

after_attach = wait_for(
    lambda state: state.get("productionReady") is True
    and state.get("audioReadyCount") == 2
    and state.get("audioBlockedCount") == 0,
)
if after_attach.get("productionReady") is not True:
    errors.append(f"productionReady did not become true after generated proxies: {after_attach.get('productionReadinessDetail')!r}")
if lane_signature(after_attach) != baseline_signature:
    errors.append("lane/source/edit-decision signature changed after attaching audio proxies")

package = {}
if not errors:
    package_result = run_package([
        "--output-dir",
        str(smoke_dir / "package"),
        "--basename",
        "episode1-package-mechanics",
        "--proof-duration",
        "8",
        "--json",
    ])
    if package_result.returncode != 0:
        errors.append("production package export failed: " + package_result.stdout + package_result.stderr)
    else:
        package = json.loads(package_result.stdout)
        if package.get("status") != "exported":
            errors.append(f"package status expected exported, got {package.get('status')!r}")
        if package.get("audioIncluded") is not True:
            errors.append("package should include audio")
        for key, expected_size in {
            "horizontal16x9": (1280, 720),
            "vertical9x16": (720, 1280),
        }.items():
            output = package.get("outputs", {}).get(key, {})
            summary = output.get("summary", {})
            if output.get("exists") is not True:
                errors.append(f"{key}: output file missing")
            if tuple(video_size(summary)) != expected_size:
                errors.append(f"{key}: expected size {expected_size}, got {video_size(summary)}")
            if not has_stream(summary, "audio"):
                errors.append(f"{key}: expected audio stream")
            if not has_stream(summary, "video"):
                errors.append(f"{key}: expected video stream")

attached_playback_paths = {}
for lane_name in audio_lane_names:
    lane = find_lane(after_attach, lane_name)
    if lane:
        attached_playback_paths[lane_name] = lane.get("playbackPath", "")

for lane_name, playback_path in attached_playback_paths.items():
    remove_if_generated(playback_path, existing_proxy_by_lane.get(lane_name, False))

restored = load_baseline()
if restored.get("productionReady") is True and not any(existing_proxy_by_lane.values()):
    errors.append("restored baseline should not remain production-ready after generated proxies are removed")
if lane_signature(restored) != baseline_signature:
    errors.append("restored lane/source/edit-decision signature differs from baseline")

summary = {
    "productionPackageMechanicsReady": not errors,
    "usedGeneratedSilentProxies": True,
    "realEpisodeAudioReady": False,
    "blockedBeforeAudio": blocked.returncode != 0,
    "packageStatus": package.get("status", ""),
    "audioIncluded": package.get("audioIncluded"),
    "outputs": {
        key: {
            "path": value.get("path"),
            "exists": value.get("exists"),
            "size": video_size(value.get("summary", {})),
            "hasAudio": has_stream(value.get("summary", {}), "audio"),
        }
        for key, value in package.get("outputs", {}).items()
    },
    "before": {
        "productionReady": baseline.get("productionReady"),
        "audioReadyCount": baseline.get("audioReadyCount"),
        "audioBlockedCount": baseline.get("audioBlockedCount"),
    },
    "afterAttach": {
        "productionReady": after_attach.get("productionReady"),
        "audioReadyCount": after_attach.get("audioReadyCount"),
        "audioBlockedCount": after_attach.get("audioBlockedCount"),
    },
    "restored": {
        "productionReady": restored.get("productionReady"),
        "audioReadyCount": restored.get("audioReadyCount"),
        "audioBlockedCount": restored.get("audioBlockedCount"),
    },
    "errors": errors,
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 production package mechanics smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 production package mechanics smoke PASSED.")
print("Note: this proves package mechanics with generated silent proxies; real Episode 1 audio still needs recovered/generated full-length proxies.")
PY
