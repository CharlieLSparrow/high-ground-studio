#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-interactive-state.json"

usage() {
  cat <<'USAGE'
Smoke Episode 1 interactive editor behavior.

Usage:
  script/smoke_episode1_interactive_editor.sh [--no-build]

What this proves against the running native app:
  - Episode 1 is loaded as whole synced lanes.
  - The monitor wall has three source players and a program output.
  - Play Through uses the whole sequence timeline.
  - Play Edit uses active-minus-skip valid ranges.
  - Seek/scrub updates the app playhead.
  - Play Edit skips an inactive gap.
  - Play Through does not skip that same gap.
  - Decision selection and reversible nudge are wired.
  - The monitor wall focus command is wired.

This script intentionally edits only metadata and restores the selected decision
nudge before it exits.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" != "--no-build" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-interactive-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/smoke_episode1_production_ready.sh" --no-build >/tmp/quipslystudio-interactive-production-ready.log

python3 - "$BASE_URL" "$STATE_PATH" <<'PY'
import json
import math
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
state_path = sys.argv[2]
errors = []
notes = []


def get_json(path, timeout=5):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path):
    return get_json(path)


def state():
    return get_json("/state")


def wait_for(label, predicate, timeout=8, interval=0.15):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = state()
        if predicate(last):
            return last
        time.sleep(interval)
    errors.append(f"{label}: timed out. Last state summary: {summarize(last)}")
    return last or {}


def summarize(s):
    if not s:
        return {}
    return {
        "playbackMode": s.get("playbackMode"),
        "playhead": s.get("playhead"),
        "isPlaying": s.get("isPlaying"),
        "validRangeCount": s.get("validRangeCount"),
        "sourcePlayerCount": s.get("sourcePlayerCount"),
        "selectedTagId": s.get("selectedTagId"),
        "selectedTagStart": s.get("selectedTagStart"),
        "lastMediaAction": s.get("lastMediaAction"),
    }


def expect(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")


def expect_true(label, actual):
    if actual is not True:
        errors.append(f"{label}: expected true, got {actual!r}")


def expect_close(label, actual, expected, tolerance=0.08):
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
                "gapEnd": nxt[0],
                "nextStart": nxt[0],
                "gapDuration": gap,
            }
    return None


def pick_selectable_tag(s):
    for lane in s.get("lanes", []):
        if lane.get("mediaKind") != "video":
            continue
        for tag in lane.get("tags", []):
            if str(tag.get("type", "")).lower() == "active" and float(tag.get("duration") or 0) >= 1:
                return lane, tag
    return None, None


initial = state()
expect_true("productionReady", initial.get("productionReady"))
expect("laneCount", initial.get("laneCount"), 5)
expect("sourceMonitorVideoCount", initial.get("sourceMonitorVideoCount"), 3)
expect("sourcePlayerCount", initial.get("sourcePlayerCount"), 3)
expect("videoProxyReadyCount", initial.get("videoProxyReadyCount"), 3)
expect("audioReadyCount", initial.get("audioReadyCount"), 2)
expect("showDecisionCount", initial.get("showDecisionCount"), 236)
expect("skipDecisionCount", initial.get("skipDecisionCount"), 118)
expect("monitorWallModel", initial.get("monitorWallModel"), "program_output_plus_whole_source_lanes")

ranges = computed_edit_ranges(initial)
expect("computed edit valid range count", len(ranges), initial.get("validRangeCount"))
gap = pick_skip_gap(ranges)
if not gap:
    errors.append("Could not find a usable skipped gap in computed edit ranges.")

command("/playback?mode=through&action=set")
through = wait_for("switch to Play Through", lambda s: s.get("playbackMode") == "Play Through")
expect("Play Through validRangeCount", through.get("validRangeCount"), 1)

command("/seek?time=1200")
seeked = wait_for("seek in Play Through", lambda s: abs(float(s.get("playhead") or 0) - 1200) < 0.08)
expect_close("Play Through seek playhead", seeked.get("playhead"), 1200)

if gap:
    command(f"/seek?time={urllib.parse.quote(str(gap['before']))}")
    wait_for("seek before gap in Play Through", lambda s: abs(float(s.get("playhead") or 0) - gap["before"]) < 0.12)
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

if gap:
    command(f"/seek?time={urllib.parse.quote(str(gap['before']))}")
    wait_for("seek before gap in Play Edit", lambda s: abs(float(s.get("playhead") or 0) - gap["before"]) < 0.12)
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
    errors.append("Could not find a selectable active video decision.")
else:
    lane_id = lane["id"]
    tag_id = tag["id"]
    original_start = float(tag.get("startTime") or 0)
    command(f"/select_tag?lane_id={urllib.parse.quote(lane_id)}&tag_id={urllib.parse.quote(tag_id)}")
    selected = wait_for("select decision", lambda s: s.get("selectedTagId") == tag_id)
    expect("selectedTagId", selected.get("selectedTagId"), tag_id)
    expect("selectedTagLaneName", selected.get("selectedTagLaneName"), lane.get("name"))

    command("/nudge_selected?delta=0.1")
    nudged = wait_for("nudge selected decision forward", lambda s: abs(float(s.get("selectedTagStart") or 0) - (original_start + 0.1)) < 0.08)
    expect_close("nudged selectedTagStart", nudged.get("selectedTagStart"), original_start + 0.1)

    command("/nudge_selected?delta=-0.1")
    restored = wait_for("restore selected decision nudge", lambda s: abs(float(s.get("selectedTagStart") or 0) - original_start) < 0.08)
    expect_close("restored selectedTagStart", restored.get("selectedTagStart"), original_start)

command("/focus_monitors")
focused = wait_for("focus monitor wall", lambda s: "Focused monitor wall" in str(s.get("lastMediaAction", "")))

final = state()
with open(state_path, "w") as handle:
    json.dump(final, handle, indent=2, sort_keys=True)

summary = {
    "productionReady": final.get("productionReady"),
    "monitorWallModel": final.get("monitorWallModel"),
    "sourceMonitorVideoCount": final.get("sourceMonitorVideoCount"),
    "sourcePlayerCount": final.get("sourcePlayerCount"),
    "playbackMode": final.get("playbackMode"),
    "validRangeCount": final.get("validRangeCount"),
    "showDecisionCount": final.get("showDecisionCount"),
    "skipDecisionCount": final.get("skipDecisionCount"),
    "selectedTagLaneName": final.get("selectedTagLaneName"),
    "lastMediaAction": final.get("lastMediaAction"),
    "proofNotes": notes,
}

print(json.dumps(summary, indent=2))
if errors:
    print("\nEpisode 1 interactive editor smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 interactive editor smoke PASSED.")
PY
