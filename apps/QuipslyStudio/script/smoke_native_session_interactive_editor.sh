#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-native-session-interactive-state.json"
SESSION_NAME=""
NO_BUILD=0
REQUIRE_PRODUCTION=0
MIN_SOURCE_MONITORS=1
ALLOW_BLOCKED_READINESS=0

usage() {
  cat <<'USAGE'
Smoke a native Quipsly Studio session as an interactive production editor.

Usage:
  script/smoke_native_session_interactive_editor.sh --session <session-name> [options]

Options:
  --session <name>          Native session to load before proof.
  --no-build                Use the currently running app.
  --require-production      Require productionReady=true.
  --allow-blocked-readiness Pass if the session loads safely but reports proxy/source blockers.
  --min-source-monitors N   Minimum whole video source monitors. Default: 1.

This proves the product invariant, not just launch:
  - whole synced source lanes are present
  - source monitors are backed by source players
  - Play Through keeps full sequence time
  - Play Edit skips inactive/cut gaps
  - seek/scrub updates playhead state
  - active decisions can be selected and nudged/restored as metadata
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION_NAME="${2:-}"
      shift
      ;;
    --no-build)
      NO_BUILD=1
      ;;
    --require-production)
      REQUIRE_PRODUCTION=1
      ;;
    --allow-blocked-readiness)
      ALLOW_BLOCKED_READINESS=1
      ;;
    --min-source-monitors)
      MIN_SOURCE_MONITORS="${2:-1}"
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
  usage >&2
  exit 2
fi

if [[ "$NO_BUILD" != "1" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-native-session-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session "$SESSION_NAME" >/tmp/quipslystudio-native-session-load.json

python3 - "$BASE_URL" "$STATE_PATH" "$SESSION_NAME" "$REQUIRE_PRODUCTION" "$MIN_SOURCE_MONITORS" "$ALLOW_BLOCKED_READINESS" <<'PY'
import json
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
state_path = sys.argv[2]
session_name = sys.argv[3]
require_production = sys.argv[4] == "1"
min_source_monitors = int(sys.argv[5])
allow_blocked_readiness = sys.argv[6] == "1"
errors = []
notes = []


def get_json(path, timeout=5):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path):
    return get_json(path)


def state():
    return get_json("/state")


def summary(s):
    return {
        "activeSessionName": s.get("activeSessionName"),
        "projectTitle": s.get("projectTitle"),
        "sequenceTitle": s.get("sequenceTitle"),
        "productionReady": s.get("productionReady"),
        "productionReadinessDetail": s.get("productionReadinessDetail"),
        "laneCount": s.get("laneCount"),
        "sourceMonitorVideoCount": s.get("sourceMonitorVideoCount"),
        "sourcePlayerCount": s.get("sourcePlayerCount"),
        "videoProxyReadyCount": s.get("videoProxyReadyCount"),
        "videoBlockedCount": s.get("videoBlockedCount"),
        "audioReadyCount": s.get("audioReadyCount"),
        "audioBlockedCount": s.get("audioBlockedCount"),
        "showDecisionCount": s.get("showDecisionCount"),
        "skipDecisionCount": s.get("skipDecisionCount"),
        "validRangeCount": s.get("validRangeCount"),
        "playbackMode": s.get("playbackMode"),
        "playhead": s.get("playhead"),
        "selectedTagLaneName": s.get("selectedTagLaneName"),
        "lastMediaAction": s.get("lastMediaAction"),
    }


def wait_for(label, predicate, timeout=12, interval=0.2):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = state()
        if predicate(last):
            return last
        time.sleep(interval)
    errors.append(f"{label}: timed out. Last state: {json.dumps(summary(last or {}), sort_keys=True)}")
    return last or {}


def expect(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")


def expect_at_least(label, actual, minimum):
    if actual is None or int(actual) < minimum:
        errors.append(f"{label}: expected >= {minimum}, got {actual!r}")


def expect_true(label, actual):
    if actual is not True:
        errors.append(f"{label}: expected true, got {actual!r}")


def expect_close(label, actual, expected, tolerance=0.1):
    if actual is None or abs(float(actual) - float(expected)) > tolerance:
        errors.append(f"{label}: expected {expected:.3f} +/- {tolerance:.3f}, got {actual!r}")


def merge_ranges(ranges):
    ranges = sorted(ranges)
    merged = []
    for start, end in ranges:
        if end <= start:
            continue
        if merged and merged[-1][1] >= start:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def subtract_ranges(cuts, ranges):
    remaining = list(ranges)
    for cut_start, cut_end in merge_ranges(cuts):
        next_ranges = []
        for start, end in remaining:
            if cut_end <= start or cut_start >= end:
                next_ranges.append((start, end))
                continue
            left_end = min(cut_start, end)
            if start < left_end:
                next_ranges.append((start, left_end))
            right_start = max(cut_end, start)
            if right_start < end:
                next_ranges.append((right_start, end))
        remaining = next_ranges
        if not remaining:
            break
    return remaining


def computed_edit_ranges(s):
    active = []
    cuts = []
    for lane in s.get("lanes", []):
        offset = float(lane.get("sourceOffset") or 0)
        for tag in lane.get("tags", []):
            tag_type = str(tag.get("type", "")).lower()
            if tag_type not in {"active", "cut"}:
                continue
            start = float(tag.get("startTime") or 0) + offset
            end = start + float(tag.get("duration") or 0)
            if end <= start:
                continue
            if tag_type == "active":
                active.append((start, end))
            else:
                cuts.append((start, end))
    return subtract_ranges(cuts, merge_ranges(active))


def pick_skip_gap(ranges):
    for current, nxt in zip(ranges, ranges[1:]):
        gap = nxt[0] - current[1]
        if current[1] > 1 and gap >= 0.45 and current[1] - current[0] >= 0.35:
            return {
                "before": current[1] - 0.18,
                "gapStart": current[1],
                "nextStart": nxt[0],
                "gapDuration": gap,
            }
    return None


def pick_selectable_tag(s):
    for lane in s.get("lanes", []):
        if lane.get("mediaKind") != "video":
            continue
        if not lane.get("playbackPath"):
            continue
        for tag in lane.get("tags", []):
            if str(tag.get("type", "")).lower() == "active" and float(tag.get("duration") or 0) >= 1:
                return lane, tag
    return None, None


initial = wait_for(
    "load native session",
    lambda s: s.get("activeSessionName") == session_name and int(s.get("laneCount") or 0) > 0,
)

expect("activeSessionName", initial.get("activeSessionName"), session_name)
expect("monitorWallModel", initial.get("monitorWallModel"), "program_output_plus_whole_source_lanes")
expect_at_least("laneCount", initial.get("laneCount"), 1)
expect_at_least("sourceMonitorVideoCount", initial.get("sourceMonitorVideoCount"), min_source_monitors)
blocked_video_count = int(initial.get("videoBlockedCount") or 0)
if allow_blocked_readiness and blocked_video_count > 0:
    notes.append(
        f"Session loaded safely with {blocked_video_count} video readiness blocker(s); proxy generation remains required."
    )
else:
    expect("sourcePlayerCount", initial.get("sourcePlayerCount"), initial.get("sourceMonitorVideoCount"))
    expect("videoBlockedCount", initial.get("videoBlockedCount"), 0)
expect_at_least("showDecisionCount", initial.get("showDecisionCount"), 1)
expect_at_least("skipDecisionCount", initial.get("skipDecisionCount"), 1)
if require_production:
    expect_true("productionReady", initial.get("productionReady"))

ranges = computed_edit_ranges(initial)
if not ranges:
    errors.append("computed edit ranges: expected at least one active output range.")

has_playback_backed_sources = int(initial.get("sourcePlayerCount") or 0) > 0

command("/playback?mode=through&action=set")
through = wait_for("switch to Play Through", lambda s: s.get("playbackMode") == "Play Through")
expect("Play Through validRangeCount", through.get("validRangeCount"), 1)

seek_time = min(1200.0, max(1.0, float(initial.get("sequenceDuration") or 2) / 3.0))
command(f"/seek?time={urllib.parse.quote(str(seek_time))}")
seeked = wait_for("seek in Play Through", lambda s: abs(float(s.get("playhead") or 0) - seek_time) < 0.12)
expect_close("Play Through seek playhead", seeked.get("playhead"), seek_time)

gap = pick_skip_gap(ranges)
if not gap:
    errors.append("Could not find a usable skipped gap; Play Edit skip behavior is unproven for this session.")
elif allow_blocked_readiness and not has_playback_backed_sources:
    notes.append("Skipped playback-advance gap proof because this session intentionally has no playback-backed source proxies yet.")
else:
    command(f"/seek?time={urllib.parse.quote(str(gap['before']))}")
    wait_for("seek before gap in Play Through", lambda s: abs(float(s.get("playhead") or 0) - gap["before"]) < 0.14)
    command("/playback?mode=through&action=play")
    time.sleep(0.55)
    command("/playback?mode=through&action=pause")
    through_gap = wait_for("pause Play Through gap proof", lambda s: s.get("isPlaying") is False)
    playhead = float(through_gap.get("playhead") or 0)
    if not (gap["gapStart"] <= playhead < gap["nextStart"]):
        errors.append(
            "Play Through gap proof: expected playhead inside inactive gap "
            f"{gap['gapStart']:.3f}..{gap['nextStart']:.3f}, got {playhead:.3f}"
        )
    else:
        notes.append(f"Play Through stayed inside inactive gap at {playhead:.2f}s.")

command("/playback?mode=edit&action=set")
edit = wait_for("switch to Play Edit", lambda s: s.get("playbackMode") == "Play Edit")
expect("Play Edit validRangeCount", edit.get("validRangeCount"), len(ranges))

if gap and not (allow_blocked_readiness and not has_playback_backed_sources):
    command(f"/seek?time={urllib.parse.quote(str(gap['before']))}")
    wait_for("seek before gap in Play Edit", lambda s: abs(float(s.get("playhead") or 0) - gap["before"]) < 0.14)
    command("/playback?mode=edit&action=play")
    time.sleep(max(0.75, min(1.4, gap["gapDuration"] + 0.35)))
    command("/playback?mode=edit&action=pause")
    edit_gap = wait_for("pause Play Edit skip proof", lambda s: s.get("isPlaying") is False)
    playhead = float(edit_gap.get("playhead") or 0)
    if playhead < gap["nextStart"] - 0.08:
        errors.append(
            "Play Edit skip proof: expected playhead to jump to next valid range "
            f">= {gap['nextStart']:.3f}, got {playhead:.3f}"
        )
    else:
        notes.append(f"Play Edit skipped inactive gap to {playhead:.2f}s.")

lane, tag = pick_selectable_tag(state())
if not lane or not tag:
    if allow_blocked_readiness and blocked_video_count > 0:
        notes.append("Skipped decision nudge proof because no video source has a playback-backed proxy yet.")
    else:
        errors.append("Could not find a selectable active video decision with a playback-backed source lane.")
else:
    lane_id = lane["id"]
    tag_id = tag["id"]
    original_start = float(tag.get("startTime") or 0)
    command(f"/select_tag?lane_id={urllib.parse.quote(lane_id)}&tag_id={urllib.parse.quote(tag_id)}")
    selected = wait_for("select decision", lambda s: s.get("selectedTagId") == tag_id)
    expect("selectedTagId", selected.get("selectedTagId"), tag_id)
    expect("selectedTagLaneName", selected.get("selectedTagLaneName"), lane.get("name"))

    command("/nudge_selected?delta=0.1")
    nudged = wait_for(
        "nudge selected decision forward",
        lambda s: abs(float(s.get("selectedTagStart") or 0) - (original_start + 0.1)) < 0.1,
    )
    expect_close("nudged selectedTagStart", nudged.get("selectedTagStart"), original_start + 0.1)

    command("/nudge_selected?delta=-0.1")
    restored = wait_for(
        "restore selected decision nudge",
        lambda s: abs(float(s.get("selectedTagStart") or 0) - original_start) < 0.1,
    )
    expect_close("restored selectedTagStart", restored.get("selectedTagStart"), original_start)

command("/focus_monitors")
wait_for("focus monitor wall", lambda s: "Focused monitor wall" in str(s.get("lastMediaAction", "")))

final = state()
expect("final activeSessionName", final.get("activeSessionName"), session_name)
with open(state_path, "w") as handle:
    json.dump(final, handle, indent=2, sort_keys=True)

proof = summary(final)
proof["proofNotes"] = notes
print(json.dumps(proof, indent=2))

if errors:
    print(f"\nNative session interactive smoke FAILED for {session_name}:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print(f"\nNative session interactive smoke PASSED for {session_name}.")
PY
