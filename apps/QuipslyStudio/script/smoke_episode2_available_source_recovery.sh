#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_EPISODE2_SESSION:-episode-2-native-proof}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Smoke Episode 2's messy recovery state without regressing into chopped clips.

Usage:
  script/smoke_episode2_available_source_recovery.sh [--no-build] [--session <name>]

This proves:
  - Episode 2 loads as whole source lanes plus metadata decisions.
  - Available proxy-backed sources are editable now.
  - Missing Premiere placeholders stay visible as recovery work.
  - Program layout excludes missing placeholders from active visual slots.
  - Final production readiness still blocks until missing sources are recovered.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      ;;
    --session)
      SESSION_NAME="${2:-}"
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

if [[ -z "$SESSION_NAME" ]]; then
  echo "Missing session name." >&2
  usage >&2
  exit 2
fi

if [[ "$NO_BUILD" == "1" ]]; then
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
else
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-episode2-recovery-build.log
fi

"$ROOT_DIR/script/agentctl.sh" load-session "$SESSION_NAME" >/tmp/quipslystudio-episode2-recovery-load.json

python3 - "$BASE_URL" "$SESSION_NAME" <<'PY'
import json
import sys
import time
import urllib.request

base_url = sys.argv[1].rstrip("/")
session_name = sys.argv[2]
errors = []


def get_json(path, timeout=8):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_state(timeout=12):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json("/state")
        if last.get("activeSessionName") == session_name and last.get("laneCount", 0) > 0:
            return last
        time.sleep(0.25)
    return last


state = wait_for_state()
snapshot = get_json("/editor_snapshot")
recovery = state.get("mediaRecoveryReport") or {}
layout = state.get("programLayout") or {}

if state.get("activeSessionName") != session_name:
    errors.append(f"activeSessionName expected {session_name!r}, got {state.get('activeSessionName')!r}")

if state.get("laneCount") != 9:
    errors.append(f"Episode 2 should have 9 whole lanes, got {state.get('laneCount')!r}")

if state.get("showDecisionCount", 0) < 1000 or state.get("skipDecisionCount", 0) < 100:
    errors.append(
        f"SHOW/SKIP metadata decisions look missing: show={state.get('showDecisionCount')} skip={state.get('skipDecisionCount')}"
    )

if snapshot.get("canEditAvailableSourcesNow") is not True:
    errors.append(f"canEditAvailableSourcesNow should be true, got {snapshot.get('canEditAvailableSourcesNow')!r}")

if snapshot.get("canEditNow") is not False:
    errors.append(f"canEditNow should remain false until source recovery is complete, got {snapshot.get('canEditNow')!r}")

if snapshot.get("needsSourceRecovery") is not True:
    errors.append(f"needsSourceRecovery should be true, got {snapshot.get('needsSourceRecovery')!r}")

evidence = snapshot.get("evidence") or {}
if evidence.get("playableVideoMonitorCount") != 5:
    errors.append(f"playableVideoMonitorCount expected 5, got {evidence.get('playableVideoMonitorCount')!r}")

if evidence.get("sourceMonitorVideoCount") != 7:
    errors.append(f"sourceMonitorVideoCount expected 7, got {evidence.get('sourceMonitorVideoCount')!r}")

if state.get("videoProxyReadyCount") != 5 or state.get("audioReadyCount") != 2:
    errors.append(
        f"Expected 5 video proxies and 2 audio proxies ready, got video={state.get('videoProxyReadyCount')} audio={state.get('audioReadyCount')}"
    )

blocked = recovery.get("blockedLanes") or []
missing_names = sorted(lane.get("laneName", "") for lane in blocked if lane.get("mediaKind") == "video")
expected_missing = sorted(["Homer Camera - video clip 235", "Unresolved Camera V2 - video clip 211"])
if missing_names != expected_missing:
    errors.append(f"Expected only placeholder video recovery lanes {expected_missing}, got {missing_names}")

active_names = [lane.get("name", "") for lane in layout.get("activeVisualLanes") or []]
if any("video clip 235" in name or "video clip 211" in name for name in active_names):
    errors.append(f"Program layout should not include missing placeholders, got activeVisualLanes={active_names}")

if layout.get("activeVisualLaneCount") != len(active_names):
    errors.append(
        f"activeVisualLaneCount mismatch: {layout.get('activeVisualLaneCount')!r} vs {len(active_names)} active lanes"
    )

if errors:
    print("Episode 2 available-source recovery smoke failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    print(json.dumps({
        "state": {
            "activeSessionName": state.get("activeSessionName"),
            "laneCount": state.get("laneCount"),
            "videoProxyReadyCount": state.get("videoProxyReadyCount"),
            "videoBlockedCount": state.get("videoBlockedCount"),
            "audioReadyCount": state.get("audioReadyCount"),
            "audioBlockedCount": state.get("audioBlockedCount"),
            "showDecisionCount": state.get("showDecisionCount"),
            "skipDecisionCount": state.get("skipDecisionCount"),
            "programLayout": layout,
        },
        "snapshot": snapshot,
        "blockedLanes": blocked,
    }, indent=2, sort_keys=True), file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "status": "pass",
    "session": session_name,
    "wholeLanes": state.get("laneCount"),
    "playableVideoMonitorCount": evidence.get("playableVideoMonitorCount"),
    "sourceMonitorVideoCount": evidence.get("sourceMonitorVideoCount"),
    "videoProxyReadyCount": state.get("videoProxyReadyCount"),
    "audioReadyCount": state.get("audioReadyCount"),
    "missingRecoveryLanes": missing_names,
    "programLayoutActiveLanes": active_names,
    "architectureInvariant": "Whole source lanes plus SHOW/SKIP metadata decisions; missing placeholders stay visible but do not occupy program layout.",
}, indent=2, sort_keys=True))
PY
