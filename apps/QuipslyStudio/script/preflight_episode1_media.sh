#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
AUDIO_DIR="${EPISODE1_AUDIO_DIR:-$MEDIA_DIR}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
READ_TIMEOUT_SECONDS="${EPISODE1_READ_TIMEOUT_SECONDS:-4}"

usage() {
  cat <<'USAGE'
Preflight Episode 1 media readability.

Usage:
  script/preflight_episode1_media.sh

This does not import or mutate the editor. It checks whether expected Episode 1
source files can be stat/read quickly enough to generate local proxies.

Environment overrides:
  EPISODE1_MEDIA_DIR=/Volumes/My Passport/Episode 1
  EPISODE1_AUDIO_DIR=/Users/wall-e/Movies/Quipsly/Staging/Episode 1 Audio
  QUIPSLY_AGENT_URL=http://127.0.0.1:8080
  EPISODE1_READ_TIMEOUT_SECONDS=1
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

python3 - "$MEDIA_DIR" "$AUDIO_DIR" "$BASE_URL" "$READ_TIMEOUT_SECONDS" <<'PY'
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

media_dir = Path(sys.argv[1])
audio_dir = Path(sys.argv[2])
base_url = sys.argv[3]
try:
    read_timeout_seconds = max(0.25, float(sys.argv[4]))
except Exception:
    read_timeout_seconds = 4.0
expected = [
    ("Charlie Camera", media_dir / "MVI_3999.MP4", "video"),
    ("Homer Camera", media_dir / "NewHomerExport.MP4", "video"),
    ("Reference Clip", media_dir / "There is no try.mp4", "video"),
    ("Charlie Audio", audio_dir / "First Pod Ever.wav", "audio"),
    ("Homer Audio", audio_dir / "HomerAudio.wav", "audio"),
]

def compact(value, limit=240):
    text = str(value or "")
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."

def timed_read(path, timeout_seconds=4):
    try:
        result = subprocess.run(
            ["/usr/bin/head", "-c", "16", str(path)],
            timeout=timeout_seconds,
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            return {"ok": True, "first16Hex": result.stdout.hex()}
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        stdout = result.stdout.decode("utf-8", errors="replace").strip()
        diagnostic = stderr or stdout or "no diagnostic"
        return {"ok": False, "error": compact(f"head exited {result.returncode}: {diagnostic}")}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timed out after {timeout_seconds}s opening/reading first bytes"}
    except Exception as error:
        return {"ok": False, "error": compact(f"{type(error).__name__}: {error}")}

try:
    with urllib.request.urlopen(f"{base_url}/state", timeout=2) as response:
        app_state = json.loads(response.read().decode("utf-8"))
except Exception as error:
    app_state = {"error": compact(f"{type(error).__name__}: {error}")}

lane_by_name = {
    lane.get("name", ""): lane
    for lane in app_state.get("lanes", [])
}

results = []
for label, path, kind in expected:
    item = {
        "label": label,
        "kind": kind,
        "path": str(path),
        "exists": path.exists(),
        "statSizeBytes": None,
        "readableWithinTimeout": False,
        "readError": "",
        "matchingLaneReadiness": "",
        "matchingLaneProxyError": "",
        "matchingLanePlaybackPath": "",
        "previewReadyFromProxy": False,
        "needsSourceReadForProxy": False,
        "verdict": "unknown",
    }
    try:
        item["statSizeBytes"] = path.stat().st_size
    except Exception as error:
        item["readError"] = compact(f"stat {type(error).__name__}: {error}")

    for lane_name, lane in lane_by_name.items():
        if label in lane_name or path.name in lane_name:
            item["matchingLaneReadiness"] = lane.get("sourceReadiness", "")
            item["matchingLaneProxyError"] = compact(lane.get("proxyError", ""))
            item["matchingLanePlaybackPath"] = lane.get("playbackPath", "")
            break

    readiness = item["matchingLaneReadiness"].lower()
    item["previewReadyFromProxy"] = "proxy ready" in readiness
    item["needsSourceReadForProxy"] = ("proxy missing" in readiness or "proxy pending" in readiness or "proxy needed" in readiness or "proxy blocked" in readiness or "missing source" in readiness)

    if item["exists"] and not item["previewReadyFromProxy"]:
        read_result = timed_read(path, timeout_seconds=read_timeout_seconds)
        item["readableWithinTimeout"] = bool(read_result.get("ok"))
        if not item["readableWithinTimeout"]:
            item["readError"] = compact(read_result.get("error", "unknown read error"))

    if not item["exists"]:
        item["verdict"] = "missing"
    elif item["previewReadyFromProxy"] and not item["readableWithinTimeout"]:
        item["verdict"] = "proxy_ready_source_slow"
    elif item["readableWithinTimeout"]:
        item["verdict"] = "readable"
    elif item["needsSourceReadForProxy"]:
        item["verdict"] = "proxy_generation_blocked"
    else:
        item["verdict"] = "blocked_or_slow"
    results.append(item)

summary = {
    "mediaDir": str(media_dir),
    "audioDir": str(audio_dir),
    "checkedAt": int(time.time()),
    "readTimeoutSeconds": read_timeout_seconds,
    "appStateError": app_state.get("error", ""),
    "appProductionReady": app_state.get("productionReady"),
    "appProductionReadinessDetail": app_state.get("productionReadinessDetail"),
    "counts": {
        "readable": sum(1 for item in results if item["verdict"] == "readable"),
        "proxyReadySourceSlow": sum(1 for item in results if item["verdict"] == "proxy_ready_source_slow"),
        "proxyGenerationBlocked": sum(1 for item in results if item["verdict"] == "proxy_generation_blocked"),
        "blockedOrSlow": sum(1 for item in results if item["verdict"] == "blocked_or_slow"),
        "missing": sum(1 for item in results if item["verdict"] == "missing"),
    },
    "results": results,
    "nextActions": [],
}

if summary["appStateError"]:
    summary["nextActions"].append("QuipslyStudio app state was unavailable. Start or rebuild the app, then rerun this preflight.")
if summary["counts"]["proxyGenerationBlocked"]:
    summary["nextActions"].append("Grant/restore the Episode 1 folder in QuipslyStudio, or relink the blocked audio lanes from a readable local/external path.")
    summary["nextActions"].append("If the external drive keeps returning read errors, run: ./script/stage_episode1_audio_for_proxy.sh")
    summary["nextActions"].append("When that dry run is readable, run: ./script/stage_episode1_audio_for_proxy.sh --copy --relink --retry")
    summary["nextActions"].append("If you already have recovered .m4a proxies, attach them without changing original sources: ./script/agentctl.sh attach-proxy \"Charlie Audio - First Pod Ever.wav\" /path/to/First_Pod_Ever_proxy.m4a")
    summary["nextActions"].append("Then attach Homer the same way: ./script/agentctl.sh attach-proxy \"Homer Audio - HomerAudio.wav\" /path/to/HomerAudio_proxy.m4a")
    summary["nextActions"].append(f"Then run: ./script/agentctl.sh match-folder {json.dumps(str(media_dir))}")
    summary["nextActions"].append("Then run: ./script/agentctl.sh retry-proxies")
if summary["counts"]["proxyReadySourceSlow"]:
    summary["nextActions"].append("Video proxy preview is already safe; do not switch preview to giant raw originals.")
if summary["counts"]["missing"]:
    summary["nextActions"].append("Some expected files are missing; relink those lanes before production editing.")
    summary["nextActions"].append("For Episode 1 audio staging, first run: ./script/stage_episode1_audio_for_proxy.sh")

print(json.dumps(summary, indent=2))

if summary["counts"]["proxyGenerationBlocked"] or summary["counts"]["blockedOrSlow"] or summary["counts"]["missing"]:
    sys.exit(2)
PY
