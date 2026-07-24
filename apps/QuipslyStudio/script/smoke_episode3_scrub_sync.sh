#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_EPISODE3_SESSION:-episode-3-premiere-rescue}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Smoke Episode 3 shared-playhead scrubbing.

Usage:
  script/smoke_episode3_scrub_sync.sh [--no-build] [--session <name>]

This proves:
  - Episode 3 loads.
  - Agent scrub, seek, and program-scroll commands all move the same sequence playhead.
  - Program Output and every playable source monitor report synchronized player times.
  - The proof uses whole source lanes and proxy players; it does not mutate SHOW/SKIP decisions.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-episode3-scrub-sync-build.log
fi

"$ROOT_DIR/script/agentctl.sh" load-session "$SESSION_NAME" >/tmp/quipslystudio-episode3-scrub-sync-load.json

python3 - "$BASE_URL" "$SESSION_NAME" <<'PY'
import json
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
session_name = sys.argv[2]
errors = []


def get_json(path, timeout=30):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path):
    return get_json(path)


def wait_for(predicate, timeout=10, interval=0.25):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json("/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def wait_for_session():
    return wait_for(
        lambda state: state.get("activeSessionName") == session_name and state.get("laneCount", 0) > 0,
        timeout=20,
    )


def wait_for_sync(target_time, tolerance=0.75):
    def predicate(state):
        proof = state.get("sourceSyncProof") or {}
        playhead = float(state.get("playhead") or 0)
        return (
            state.get("activeSessionName") == session_name
            and abs(playhead - target_time) <= tolerance
            and proof.get("sourceSyncPassing") is True
            and int(proof.get("playableSourceMonitorCount") or 0) >= 4
        )

    return wait_for(predicate, timeout=12, interval=0.20)


state = wait_for_session()
if state.get("activeSessionName") != session_name:
    errors.append(f"activeSessionName expected {session_name!r}, got {state.get('activeSessionName')!r}")

checks = [
    ("scrub", "/scrub?time=420", 420.0),
    ("seek", "/seek?time=615", 615.0),
    ("program-scroll", "/program_scroll?delta=5", 620.0),
]

proofs = []
for label, path, expected_playhead in checks:
    command(path)
    state = wait_for_sync(expected_playhead)
    proof = state.get("sourceSyncProof") or {}
    proofs.append({
        "command": label,
        "expectedPlayhead": expected_playhead,
        "actualPlayhead": state.get("playhead"),
        "sourceSyncPassing": proof.get("sourceSyncPassing"),
        "playableSourceMonitorCount": proof.get("playableSourceMonitorCount"),
        "maxSourcePlayerDeltaSeconds": proof.get("maxSourcePlayerDeltaSeconds"),
        "sourceSyncToleranceSeconds": proof.get("sourceSyncToleranceSeconds"),
    })
    if abs(float(state.get("playhead") or 0) - expected_playhead) > 0.75:
        errors.append(f"{label} playhead expected near {expected_playhead:.2f}s, got {state.get('playhead')!r}")
    if proof.get("sourceSyncPassing") is not True:
        errors.append(f"{label} sourceSyncProof should pass, got {proof}")
    if int(proof.get("playableSourceMonitorCount") or 0) < 4:
        errors.append(f"{label} expected at least 4 playable source monitors, got {proof.get('playableSourceMonitorCount')!r}")

if errors:
    print("Episode 3 scrub sync smoke failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    print(json.dumps({"proofs": proofs, "lastState": state}, indent=2, sort_keys=True), file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "status": "pass",
    "session": session_name,
    "architectureInvariant": "One sequence playhead drives Program Output, source monitors, timeline, and agent state over whole proxy-backed source lanes.",
    "proofs": proofs,
}, indent=2, sort_keys=True))
PY
