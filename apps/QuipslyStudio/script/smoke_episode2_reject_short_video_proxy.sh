#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"

usage() {
  cat <<'EOF'
Usage:
  script/smoke_episode2_reject_short_video_proxy.sh [--no-build]

Proves the whole-lane proxy invariant for Episode 2:
  - loads the Episode 2 native proof session
  - attaches a deliberately too-short video proxy to the protected Charlie lane
  - expects the app to classify it as Proxy blocked, not Proxy ready
  - restores the original session JSON afterward

This protects the product rule: proxies represent whole synced source lanes,
not clipped substitutes.
EOF
}

build_first=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      build_first=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$build_first" == "1" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify
fi

python3 - "$ROOT_DIR" "$AGENT_URL" <<'PY'
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(sys.argv[1])
agent_url = sys.argv[2].rstrip("/")


def request(path: str):
    with urllib.request.urlopen(agent_url + path, timeout=20) as response:
        data = response.read()
    if not data:
        return {}
    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return {"raw": data.decode("utf-8", errors="replace")}


def command(command_name: str, **values):
    query = urllib.parse.urlencode(values)
    suffix = f"?{query}" if query else ""
    return request(f"/{command_name}{suffix}")


def find_lane(state, lane_name_fragment):
    fragment = lane_name_fragment.lower()
    for lane in state.get("lanes", []):
        if fragment in lane.get("name", "").lower():
            return lane
    return None


def ffmpeg_path():
    for candidate in [
        os.environ.get("QUIPSLY_FFMPEG_PATH", ""),
        shutil.which("ffmpeg") or "",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ]:
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit("ffmpeg is required for this smoke test.")


command("load_session", name="episode-2-native-proof")
state = request("/state")
session_path = state.get("lastSessionPath")
if not session_path:
    raise SystemExit("No lastSessionPath reported after loading episode-2-native-proof.")

session_path = Path(session_path)
if not session_path.exists():
    raise SystemExit(f"Session path does not exist: {session_path}")

target = find_lane(state, "CharlieVid1.MP4")
if not target:
    raise SystemExit("Could not find Episode 2 CharlieVid1 lane.")

original_readiness = target.get("sourceReadiness")
if original_readiness not in {"Original protected", "Proxy blocked", "Proxy pending"}:
    raise SystemExit(f"Unexpected starting readiness for CharlieVid1: {original_readiness!r}")

tmp_dir = Path(tempfile.mkdtemp(prefix="quipsly-short-video-proxy-"))
backup_path = tmp_dir / session_path.name
shutil.copy2(session_path, backup_path)
short_proxy = tmp_dir / "short_fake_whole_lane_proxy.mp4"

subprocess.run(
    [
        ffmpeg_path(),
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=640x360:r=30:d=1",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000:d=1",
        "-shortest",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        str(short_proxy),
    ],
    check=True,
)

errors = []
try:
    command("attach_proxy", lane_id=target["name"], path=str(short_proxy))

    final = None
    for _ in range(40):
        time.sleep(0.25)
        state = request("/state")
        lane = find_lane(state, "CharlieVid1.MP4")
        if not lane:
            errors.append("CharlieVid1 lane disappeared after attach_proxy.")
            break
        readiness = lane.get("sourceReadiness")
        detail = lane.get("sourceReadinessDetail", "")
        if readiness != "Proxy validating":
            final = lane
            break

    if final is None:
        errors.append("Short video proxy stayed in Proxy validating too long.")
    else:
        readiness = final.get("sourceReadiness")
        detail = final.get("sourceReadinessDetail", "")
        if readiness != "Proxy blocked":
            errors.append(f"Expected short video proxy to be Proxy blocked, got {readiness!r}: {detail}")
        if "too short" not in detail.lower() and "full-length" not in detail.lower():
            errors.append(f"Proxy blocked detail did not explain full-lane mismatch: {detail!r}")

    if state.get("productionReady") is True:
        errors.append("Episode 2 became productionReady after attaching a too-short proxy.")

    if state.get("videoBlockedCount", 0) < 1:
        errors.append(f"Expected at least one blocked video lane, got {state.get('videoBlockedCount')!r}.")

finally:
    shutil.copy2(backup_path, session_path)
    command("load_session", name="episode-2-native-proof")
    shutil.rmtree(tmp_dir, ignore_errors=True)

if errors:
    print("\nEpisode 2 short video proxy rejection smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f" - {error}", file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "status": "passed",
    "targetLane": target["name"],
    "startingReadiness": original_readiness,
    "rejectedReadiness": final.get("sourceReadiness") if final else "",
    "rejectedDetail": final.get("sourceReadinessDetail") if final else "",
    "restoredSession": str(session_path),
}, indent=2))
print("\nEpisode 2 short video proxy rejection smoke PASSED.")
PY
