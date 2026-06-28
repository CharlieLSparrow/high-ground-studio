#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="QuipslyMac"
APP_DISPLAY_NAME="Quipsly Studio"
APP_BUNDLE_ID="com.highground.QuipslyMac"
LEGACY_BUNDLE_ID="com.quipsly.mac"
EPISODE1_SESSION="${QUIPSLY_EPISODE1_SESSION:-episode-1-codex-real-edit-v1-youtube-wordtimed}"
APP_BUNDLE="$ROOT_DIR/DerivedData/Build/Products/Debug/$APP_NAME.app"
APP_EXECUTABLE="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

usage() {
  cat <<'USAGE'
QuipslyStudio local operator control

Usage:
  script/studioctl.sh app-info
  script/studioctl.sh canonical-pids
  script/studioctl.sh warn-duplicates
  script/studioctl.sh verify-app
  script/studioctl.sh launch [--no-build]
  script/studioctl.sh load-episode1
  script/studioctl.sh state-summary
  script/studioctl.sh prove-editor-control
  script/studioctl.sh prove-ui-ready
  script/studioctl.sh prove-program-scroll
  script/studioctl.sh prove-timeline-drag
  script/studioctl.sh prove-agent-test-driver [session-name] [output-dir]
  script/studioctl.sh ui-tools [--install]
  script/studioctl.sh ui-request-access
  script/studioctl.sh ui-activate
  script/studioctl.sh ui-move <x> <y>
  script/studioctl.sh ui-click <x> <y>
  script/studioctl.sh ui-drag <startX> <startY> <endX> <endY>
  script/studioctl.sh ui-drag-timeline
  script/studioctl.sh ui-scroll <x> <y> <deltaX> <deltaY> [repeatCount]
  script/studioctl.sh ui-scroll-program <deltaX> <deltaY> [repeatCount]
  script/studioctl.sh ui-scroll-window <xFraction> <yFraction> <deltaX> <deltaY> [repeatCount]
  script/studioctl.sh ui-window-frame
  script/studioctl.sh ui-key <virtual-key-code>
  script/studioctl.sh ui-cliclick <cliclick-command> [...]
  script/studioctl.sh ui-check-access

Purpose:
  This is the local control harness for the native QuipslyStudio editor.
  It exists so humans and agents target the canonical editor bundle, not the
  older apps/quipsly-mac prototype or an offloaded DerivedData copy.

Contract:
  - Canonical bundle: DerivedData/Build/Products/Debug/QuipslyMac.app
  - Canonical bundle id: com.highground.QuipslyMac
  - Legacy prototype bundle id to avoid: com.quipsly.mac
  - Agent API: 127.0.0.1:8080 via script/agentctl.sh
  - OS event proof: script/mac_eventctl.swift for pointer, click, key, drag, and scroll
  - Optional fallback: cliclick, checked by script/studioctl.sh ui-tools
USAGE
}

plist_value() {
  local key="$1"
  /usr/libexec/PlistBuddy -c "Print :$key" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || true
}

app_info() {
  if [[ ! -d "$APP_BUNDLE" ]]; then
    cat <<INFO
status=missing
canonicalBundle=$APP_BUNDLE
hint=Run script/build_and_run.sh --verify first.
INFO
    return 1
  fi

  cat <<INFO
status=present
displayName=$APP_DISPLAY_NAME
bundleName=$(plist_value CFBundleName)
bundleId=$(plist_value CFBundleIdentifier)
executable=$APP_EXECUTABLE
canonicalBundle=$APP_BUNDLE
legacyBundleId=$LEGACY_BUNDLE_ID
INFO
}

canonical_pids() {
  ps -axo pid=,command= | awk -v executable="$APP_EXECUTABLE" '
    {
      pid = $1
      commandLine = $0
      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "", commandLine)
      if (commandLine == executable || index(commandLine, executable " ") == 1) {
        print pid
      }
    }
  '
}

legacy_pids() {
  ps -axo pid=,command= | awk '
    {
      pid = $1
      commandLine = $0
      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "", commandLine)
      legacyExecutable = "/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac/dist/QuipslyMac.app/Contents/MacOS/QuipslyMac"
      if (commandLine == legacyExecutable || index(commandLine, legacyExecutable " ") == 1) {
        print pid
      }
    }
  '
}

warn_duplicates() {
  local canonical legacy
  canonical="$(canonical_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  legacy="$(legacy_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

  if [[ -n "$canonical" ]]; then
    echo "canonicalPids=$canonical"
  else
    echo "canonicalPids="
  fi

  if [[ -n "$legacy" ]]; then
    echo "warning=legacy_quipsly_mac_running"
    echo "legacyPids=$legacy"
    echo "legacyPath=/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac/dist/QuipslyMac.app"
  else
    echo "legacyPids="
  fi
}

verify_app() {
  local bundle_id
  app_info >/tmp/quipslystudio-app-info.$$
  cat /tmp/quipslystudio-app-info.$$
  rm -f /tmp/quipslystudio-app-info.$$

  bundle_id="$(plist_value CFBundleIdentifier)"
  if [[ "$bundle_id" != "$APP_BUNDLE_ID" ]]; then
    echo "error=wrong_bundle_id expected=$APP_BUNDLE_ID actual=$bundle_id" >&2
    return 1
  fi

  if [[ ! -x "$APP_EXECUTABLE" ]]; then
    echo "error=missing_executable executable=$APP_EXECUTABLE" >&2
    return 1
  fi

  warn_duplicates
}

app_window_frame_csv() {
  osascript -e 'tell application "System Events" to tell process "QuipslyMac" to tell window 1 to get {position, size}' 2>/dev/null
}

ui_window_frame() {
  local frame
  frame="$(app_window_frame_csv)"
  if [[ -z "$frame" ]]; then
    echo "error=window_frame_unavailable process=QuipslyMac" >&2
    return 1
  fi
  python3 - "$frame" <<'PY'
import re
import sys

values = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", sys.argv[1])]
if len(values) < 4:
    raise SystemExit("error=window_frame_parse_failed raw=" + sys.argv[1])
x, y, width, height = values[:4]
print(f"windowFrame source=SystemEvents x={x:.0f} y={y:.0f} width={width:.0f} height={height:.0f}")
PY
}

ui_scroll_window() {
  local x_fraction="${1:-}" y_fraction="${2:-}" delta_x="${3:-}" delta_y="${4:-}" repeat_count="${5:-1}" frame coords
  frame="$(app_window_frame_csv)"
  if [[ -z "$frame" ]]; then
    echo "error=window_frame_unavailable process=QuipslyMac" >&2
    return 1
  fi
  coords="$(python3 - "$frame" "$x_fraction" "$y_fraction" <<'PY'
import re
import sys

values = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", sys.argv[1])]
if len(values) < 4:
    raise SystemExit("error=window_frame_parse_failed raw=" + sys.argv[1])
x, y, width, height = values[:4]
xf = min(1.0, max(0.0, float(sys.argv[2])))
yf = min(1.0, max(0.0, float(sys.argv[3])))
print(f"{round(x + width * xf)} {round(y + height * yf)}")
PY
)"
  "$ROOT_DIR/script/mac_eventctl.swift" scroll ${coords} "$delta_x" "$delta_y" "$repeat_count"
  echo "scrolledWindow source=SystemEvents xFraction=$x_fraction yFraction=$y_fraction deltaX=$delta_x deltaY=$delta_y repeatCount=$repeat_count"
}

ui_scroll_program() {
  local delta_x="${1:-}" delta_y="${2:-}" repeat_count="${3:-1}" frame state_file coords
  frame="$(app_window_frame_csv)"
  if [[ -z "$frame" ]]; then
    echo "error=window_frame_unavailable process=QuipslyMac" >&2
    return 1
  fi
  state_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-state.XXXXXX")"
  "$ROOT_DIR/script/agentctl.sh" state > "$state_file"
  coords="$(python3 - "$frame" "$state_file" <<'PY'
import json
import re
import sys

frame_values = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", sys.argv[1])]
if len(frame_values) < 4:
    raise SystemExit("error=window_frame_parse_failed raw=" + sys.argv[1])
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    state = json.load(handle)
hitbox = state.get("programMonitorHitbox") or state.get("sharedPlayheadContract", {}).get("programMonitorHitbox") or {}
if hitbox.get("available") is not True:
    raise SystemExit("error=program_monitor_hitbox_unavailable reason=" + str(hitbox.get("reason", "unknown")))

window_x, window_y, window_width, window_height = frame_values[:4]
center_x = float(hitbox["centerX"])
center_y = float(hitbox["centerY"])
global_x = window_x + center_x
global_y = window_y + window_height - center_y
print(f"{round(global_x)} {round(global_y)} {center_x:.1f} {center_y:.1f} {window_x:.1f} {window_y:.1f} {window_width:.1f} {window_height:.1f}")
PY
)"
  rm -f "$state_file"
  read -r global_x global_y local_x local_y window_x window_y window_width window_height <<<"$coords"
  "$ROOT_DIR/script/mac_eventctl.swift" scroll "$global_x" "$global_y" "$delta_x" "$delta_y" "$repeat_count"
  echo "scrolledProgram source=programMonitorHitbox globalX=$global_x globalY=$global_y localX=$local_x localY=$local_y windowX=$window_x windowY=$window_y windowWidth=$window_width windowHeight=$window_height deltaX=$delta_x deltaY=$delta_y repeatCount=$repeat_count"
}

ui_drag_timeline() {
  local frame state_file coords
  frame="$(app_window_frame_csv)"
  if [[ -z "$frame" ]]; then
    echo "error=window_frame_unavailable process=QuipslyMac" >&2
    return 1
  fi
  state_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-state.XXXXXX")"
  "$ROOT_DIR/script/agentctl.sh" state > "$state_file"
  coords="$(python3 - "$frame" "$state_file" <<'PY'
import json
import re
import sys

frame_values = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", sys.argv[1])]
if len(frame_values) < 4:
    raise SystemExit("error=window_frame_parse_failed raw=" + sys.argv[1])
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    state = json.load(handle)
hitbox = state.get("timelineHitbox") or state.get("sharedPlayheadContract", {}).get("timelineHitbox") or {}
if hitbox.get("available") is not True:
    raise SystemExit("error=timeline_hitbox_unavailable reason=" + str(hitbox.get("reason", "unknown")))

window_x, window_y, window_width, window_height = frame_values[:4]
start_x = float(hitbox["recommendedRulerDragStartX"])
end_x = float(hitbox["recommendedRulerDragEndX"])
local_y = float(hitbox["recommendedRulerDragY"])
if local_y < 0 or local_y > window_height:
    raise SystemExit(
        "error=timeline_hitbox_not_visible "
        f"localY={local_y:.1f} windowHeight={window_height:.1f} "
        "hint=focus_timeline_or_scroll_editor_before_dragging"
    )
global_start_x = window_x + start_x
global_end_x = window_x + end_x
global_y = window_y + window_height - local_y
print(
    f"{round(global_start_x)} {round(global_y)} {round(global_end_x)} {round(global_y)} "
    f"{start_x:.1f} {end_x:.1f} {local_y:.1f} {window_x:.1f} {window_y:.1f} {window_width:.1f} {window_height:.1f}"
)
PY
)"
  rm -f "$state_file"
  read -r global_start_x global_y global_end_x _global_end_y local_start_x local_end_x local_y window_x window_y window_width window_height <<<"$coords"
  "$ROOT_DIR/script/mac_eventctl.swift" drag "$global_start_x" "$global_y" "$global_end_x" "$global_y"
  echo "draggedTimeline source=timelineHitbox globalStartX=$global_start_x globalY=$global_y globalEndX=$global_end_x localStartX=$local_start_x localEndX=$local_end_x localY=$local_y windowX=$window_x windowY=$window_y windowWidth=$window_width windowHeight=$window_height"
}

launch_app() {
  local mode="${1:-}"
  if [[ "$mode" == "--no-build" ]]; then
    "$ROOT_DIR/script/build_and_run.sh" --no-build
  else
    "$ROOT_DIR/script/build_and_run.sh" --verify
  fi
  warn_duplicates
}

load_episode1() {
  "$ROOT_DIR/script/agentctl.sh" load-session-wait "$EPISODE1_SESSION" 90 >/tmp/quipslystudio-load-episode1.json
  state_summary
}

state_summary() {
  "$ROOT_DIR/script/agentctl.sh" state | python3 -c '
import json
import sys

state = json.load(sys.stdin)
keys = [
    "activeSessionName",
    "projectTitle",
    "sequenceTitle",
    "productionReady",
    "visualRoughCutReady",
    "playhead",
    "playbackMode",
    "playbackFormat",
    "sourceMonitorVideoCount",
    "sourcePlayerCount",
    "timelinePixelsPerSecond",
    "timelineFitToWindow",
    "timelineAutoCenterOnSelection",
    "timelineSelectedDecisionCenterTargetSeconds",
    "selectedLaneName",
    "selectedTagType",
    "selectedVisualDecisionIndex",
    "selectedVisualDecisionSequenceTime",
    "showDecisionCount",
    "skipDecisionCount",
    "lastMediaAction",
]
print(json.dumps({key: state.get(key) for key in keys}, indent=2, sort_keys=True))
'
}

prove_editor_control() {
  "$ROOT_DIR/script/agentctl.sh" load-session-wait "$EPISODE1_SESSION" 90 >/tmp/quipslystudio-prove-load.json
  "$ROOT_DIR/script/agentctl.sh" timeline-zoom frame >/tmp/quipslystudio-prove-zoom.json
  "$ROOT_DIR/script/agentctl.sh" select-decision first video >/tmp/quipslystudio-prove-first.json
  "$ROOT_DIR/script/agentctl.sh" select-decision next video >/tmp/quipslystudio-prove-next.json
  "$ROOT_DIR/script/agentctl.sh" scrub 20 >/tmp/quipslystudio-prove-scrub.json

  "$ROOT_DIR/script/agentctl.sh" state | python3 -c '
import json
import sys

expected_session = sys.argv[1]
state = json.load(sys.stdin)
errors = []
if state.get("activeSessionName") != expected_session:
    errors.append(f"Configured Episode 1 session is not active. expected={expected_session} actual={state.get('activeSessionName')}")
if state.get("productionReady") is not True:
    errors.append("Episode 1 is not proxy production ready.")
if int(state.get("sourceMonitorVideoCount") or 0) < 3:
    errors.append("Expected at least three source monitor videos.")
if abs(float(state.get("playhead") or 0) - 20.0) > 0.2:
    errors.append("Shared playhead did not scrub to 20s.")
if float(state.get("timelinePixelsPerSecond") or 0) < 239:
    errors.append("Frame zoom did not stay active.")

proof = {
    "status": "failed" if errors else "passed",
    "activeSessionName": state.get("activeSessionName"),
    "productionReady": state.get("productionReady"),
    "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount"),
    "sourcePlayerCount": state.get("sourcePlayerCount"),
    "playhead": state.get("playhead"),
    "timelinePixelsPerSecond": state.get("timelinePixelsPerSecond"),
    "timelineFitToWindow": state.get("timelineFitToWindow"),
    "selectedLaneName": state.get("selectedLaneName"),
    "selectedTagType": state.get("selectedTagType"),
    "showDecisionCount": state.get("showDecisionCount"),
    "skipDecisionCount": state.get("skipDecisionCount"),
    "lastMediaAction": state.get("lastMediaAction"),
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
' "$EPISODE1_SESSION"
}

prove_ui_ready() {
  verify_app >/tmp/quipslystudio-verify-app.txt
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
  prove_editor_control
}

prove_program_scroll() {
  "$ROOT_DIR/script/agentctl.sh" load-session-wait "$EPISODE1_SESSION" 90 >/tmp/quipslystudio-prove-program-scroll-load.json
  sleep 2
  "$ROOT_DIR/script/agentctl.sh" scrub 0 >/dev/null
  sleep 0.5
  "$ROOT_DIR/script/agentctl.sh" program-scroll 2.5 >/dev/null
  sleep 0.5
  local before_file after_file
  before_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-program-scroll-before.XXXXXX")"
  after_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-program-scroll-after.XXXXXX")"
  "$ROOT_DIR/script/agentctl.sh" state > "$before_file"
  ui_activate_quiet
  ui_scroll_program 0 -80 4 >/tmp/quipslystudio-prove-program-scroll-physical.txt
  sleep 0.8
  "$ROOT_DIR/script/agentctl.sh" state > "$after_file"
  python3 - "$before_file" "$after_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    before = json.load(handle)
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    after = json.load(handle)

before_playhead = float(before.get("playhead") or 0)
after_playhead = float(after.get("playhead") or 0)
hitbox = after.get("programMonitorHitbox") or after.get("sharedPlayheadContract", {}).get("programMonitorHitbox") or {}
passing = after.get("sharedPlayheadContract", {}).get("passing") is True
changed = abs(after_playhead - before_playhead) >= 0.25
errors = []
if hitbox.get("available") is not True:
    errors.append("Program Output hitbox is not available in /state.")
if not changed:
    errors.append("Physical Program Output scroll did not move the shared playhead.")
if not passing:
    errors.append("Shared playhead/source sync did not remain passing after physical scroll.")

proof = {
    "status": "failed" if errors else "passed",
    "activeSessionName": after.get("activeSessionName"),
    "beforePlayhead": before_playhead,
    "afterPlayhead": after_playhead,
    "playheadDelta": after_playhead - before_playhead,
    "sharedPlayheadPassing": passing,
    "sharedPlayheadStatus": after.get("sharedPlayheadContract", {}).get("status"),
    "maxSourceDelta": after.get("sharedPlayheadContract", {}).get("maxSourcePlayerDeltaSeconds"),
    "programMonitorHitbox": hitbox,
    "lastMediaAction": after.get("lastMediaAction"),
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
  rm -f "$before_file" "$after_file"
}

prove_timeline_drag() {
  "$ROOT_DIR/script/agentctl.sh" load-session-wait "$EPISODE1_SESSION" 90 >/tmp/quipslystudio-prove-timeline-drag-load.json
  sleep 2
  "$ROOT_DIR/script/agentctl.sh" timeline-zoom set 10 >/dev/null
  "$ROOT_DIR/script/agentctl.sh" scrub 0 >/dev/null
  "$ROOT_DIR/script/agentctl.sh" focus-timeline >/dev/null
  sleep 0.8
  sleep 0.5
  local before_file after_file
  before_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-timeline-drag-before.XXXXXX")"
  after_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-timeline-drag-after.XXXXXX")"
  "$ROOT_DIR/script/agentctl.sh" state > "$before_file"
  ui_activate_quiet
  ui_drag_timeline >/tmp/quipslystudio-prove-timeline-drag-physical.txt
  sleep 0.8
  "$ROOT_DIR/script/agentctl.sh" state > "$after_file"
  python3 - "$before_file" "$after_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    before = json.load(handle)
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    after = json.load(handle)

before_playhead = float(before.get("playhead") or 0)
after_playhead = float(after.get("playhead") or 0)
hitbox = after.get("timelineHitbox") or after.get("sharedPlayheadContract", {}).get("timelineHitbox") or {}
passing = after.get("sharedPlayheadContract", {}).get("passing") is True
changed = abs(after_playhead - before_playhead) >= 0.25
errors = []
if hitbox.get("available") is not True:
    errors.append("Episode Spine timeline hitbox is not available in /state.")
if not changed:
    errors.append("Physical Episode Spine timeline drag did not move the shared playhead.")
if not passing:
    errors.append("Shared playhead/source sync did not remain passing after timeline drag.")

proof = {
    "status": "failed" if errors else "passed",
    "activeSessionName": after.get("activeSessionName"),
    "beforePlayhead": before_playhead,
    "afterPlayhead": after_playhead,
    "playheadDelta": after_playhead - before_playhead,
    "sharedPlayheadPassing": passing,
    "sharedPlayheadStatus": after.get("sharedPlayheadContract", {}).get("status"),
    "maxSourceDelta": after.get("sharedPlayheadContract", {}).get("maxSourcePlayerDeltaSeconds"),
    "timelineHitbox": hitbox,
    "timelinePixelsPerSecond": after.get("timelinePixelsPerSecond"),
    "timelineFitToWindow": after.get("timelineFitToWindow"),
    "lastMediaAction": after.get("lastMediaAction"),
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
  rm -f "$before_file" "$after_file"
}

prove_agent_test_driver() {
  local session_name output_dir stamp load_file before_file after_file zoom_file scrub_file select_file workbench_file format_file restore_file commands_file summary_file python_status
  session_name="${1:-episode-1-codex-original-edit}"
  output_dir="${2:-$ROOT_DIR/.quipsly/agent-observations}"
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  mkdir -p "$output_dir"

  load_file="$output_dir/agent-driver-proof-$stamp-load.json"
  before_file="$output_dir/agent-driver-proof-$stamp-before.json"
  after_file="$output_dir/agent-driver-proof-$stamp-after.json"
  zoom_file="$output_dir/agent-driver-proof-$stamp-zoom.json"
  scrub_file="$output_dir/agent-driver-proof-$stamp-scrub.json"
  select_file="$output_dir/agent-driver-proof-$stamp-select.json"
  workbench_file="$output_dir/agent-driver-proof-$stamp-workbench.json"
  format_file="$output_dir/agent-driver-proof-$stamp-format.json"
  restore_file="$output_dir/agent-driver-proof-$stamp-restore-format.json"
  commands_file="$output_dir/agent-driver-proof-$stamp-commands.json"
  summary_file="$output_dir/agent-driver-proof-$stamp-summary.json"

  "$ROOT_DIR/script/agentctl.sh" load-session "$session_name" > "$load_file"
  sleep 1
  "$ROOT_DIR/script/agentctl.sh" state > "$before_file"

  "$ROOT_DIR/script/agentctl.sh" timeline-zoom set 80 > "$zoom_file"
  "$ROOT_DIR/script/agentctl.sh" scrub 42 > "$scrub_file"
  "$ROOT_DIR/script/agentctl.sh" select-decision at_playhead video > "$select_file"
  "$ROOT_DIR/script/agentctl.sh" left-workbench shorts > "$workbench_file"
  "$ROOT_DIR/script/agentctl.sh" format 9:16 > "$format_file"
  sleep 0.8
  "$ROOT_DIR/script/agentctl.sh" state > "$after_file"

  cat > "$commands_file" <<EOF
{
  "driver": "QuipslyStudio Agent Test Driver",
  "createdAt": "$stamp",
  "sessionName": "$session_name",
  "artifactPolicy": "Metadata, view state, and control-plane proof only. Source media and proxy media are not modified by this proof.",
  "commands": [
    {"name": "load-session", "args": ["$session_name"], "outputPath": "$load_file"},
    {"name": "state", "label": "before", "outputPath": "$before_file"},
    {"name": "timeline-zoom", "args": ["set", "80"], "outputPath": "$zoom_file"},
    {"name": "scrub", "args": ["42"], "outputPath": "$scrub_file"},
    {"name": "select-decision", "args": ["at_playhead", "video"], "outputPath": "$select_file"},
    {"name": "left-workbench", "args": ["shorts"], "outputPath": "$workbench_file"},
    {"name": "format", "args": ["9:16"], "outputPath": "$format_file"},
    {"name": "state", "label": "after", "outputPath": "$after_file"}
  ]
}
EOF

  set +e
  python3 - "$before_file" "$after_file" "$summary_file" "$commands_file" "$session_name" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    before = json.load(handle)
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    after = json.load(handle)
summary_path = sys.argv[3]
commands_path = sys.argv[4]
expected_session_name = sys.argv[5]

errors = []
playhead = float(after.get("playhead") or 0)
timeline_scale = float(after.get("timelinePixelsPerSecond") or 0)
shared = after.get("sharedPlayheadContract") or {}

if after.get("activeSessionName") != expected_session_name:
    errors.append(f"Expected session is not active after agent driver commands. expected={expected_session_name!r} actual={after.get('activeSessionName')!r}")
if abs(playhead - 42.0) > 2.0:
    errors.append(f"Agent scrub/select context did not stay near 42s. actual={playhead:.2f}")
if timeline_scale < 79:
    errors.append(f"Agent timeline zoom did not reach edit scale. actual={timeline_scale:.2f}")
if shared.get("passing") is not True:
    errors.append("Shared playhead/source sync is not passing after agent driver commands.")
if not after.get("selectedLaneName"):
    errors.append("Agent select-decision did not leave a selected lane.")
if not after.get("selectedTagType"):
    errors.append("Agent select-decision did not leave a selected decision tag.")

proof = {
    "status": "failed" if errors else "passed",
    "driver": "QuipslyStudio Agent Test Driver",
    "truth": "This proves Codex can observe, zoom, scrub, select a decision, open a workbench, switch output format, and re-observe through semantic editor commands instead of pixels.",
    "sessionName": expected_session_name,
    "activeSessionName": after.get("activeSessionName"),
    "beforePlayhead": before.get("playhead"),
    "afterPlayhead": after.get("playhead"),
    "timelinePixelsPerSecond": after.get("timelinePixelsPerSecond"),
    "timelineFitToWindow": after.get("timelineFitToWindow"),
    "playbackFormat": after.get("playbackFormat"),
    "selectedLaneName": after.get("selectedLaneName"),
    "selectedTagType": after.get("selectedTagType"),
    "sharedPlayheadPassing": shared.get("passing"),
    "sharedPlayheadStatus": shared.get("status"),
    "lastMediaAction": after.get("lastMediaAction"),
    "artifactPolicy": "Metadata, view state, and control-plane proof only. Source media and proxy media are not modified by this proof.",
    "receiptPaths": {
        "before": sys.argv[1],
        "after": sys.argv[2],
        "commands": commands_path,
        "summary": summary_path,
    },
    "errors": errors,
}
with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(proof, handle, indent=2, sort_keys=True)
    handle.write("\n")
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
  python_status=$?
  set -e

  "$ROOT_DIR/script/agentctl.sh" format 16:9 > "$restore_file" || true
  return "$python_status"
}

ui_activate_quiet() {
  "$ROOT_DIR/script/mac_eventctl.swift" activate "$APP_BUNDLE_ID" >/dev/null
  osascript -e 'tell application id "com.highground.QuipslyMac" to activate' >/dev/null 2>&1 || true
  osascript -e 'tell application "System Events" to tell process "QuipslyMac" to set frontmost to true' >/dev/null 2>&1 || true
  sleep 0.2
}

command="${1:-}"
case "$command" in
  app-info)
    app_info
    ;;
  canonical-pids)
    canonical_pids
    ;;
  warn-duplicates)
    warn_duplicates
    ;;
  verify-app)
    verify_app
    ;;
  launch)
    launch_app "${2:-}"
    ;;
  load-episode1)
    load_episode1
    ;;
  state-summary)
    state_summary
    ;;
  prove-editor-control)
    prove_editor_control
    ;;
  prove-ui-ready)
    prove_ui_ready
    ;;
  prove-program-scroll)
    prove_program_scroll
    ;;
  prove-timeline-drag)
    prove_timeline_drag
    ;;
  prove-agent-test-driver)
    prove_agent_test_driver "${2:-}" "${3:-}"
    ;;
  ui-tools)
    "$ROOT_DIR/script/install_ui_control_tools.sh" "${2:-}"
    ;;
  ui-request-access)
    "$ROOT_DIR/script/mac_eventctl.swift" request-access
    ;;
  ui-activate)
    "$ROOT_DIR/script/mac_eventctl.swift" activate "$APP_BUNDLE_ID"
    ;;
  ui-move)
    "$ROOT_DIR/script/mac_eventctl.swift" move "${2:-}" "${3:-}"
    ;;
  ui-click)
    "$ROOT_DIR/script/mac_eventctl.swift" click "${2:-}" "${3:-}"
    ;;
  ui-drag)
    "$ROOT_DIR/script/mac_eventctl.swift" drag "${2:-}" "${3:-}" "${4:-}" "${5:-}"
    ;;
  ui-drag-timeline)
    ui_drag_timeline
    ;;
  ui-scroll)
    "$ROOT_DIR/script/mac_eventctl.swift" scroll "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}"
    ;;
  ui-scroll-program)
    ui_scroll_program "${2:-}" "${3:-}" "${4:-1}"
    ;;
  ui-scroll-window)
    ui_scroll_window "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-1}"
    ;;
  ui-window-frame)
    ui_window_frame
    ;;
  ui-key)
    "$ROOT_DIR/script/mac_eventctl.swift" key "${2:-}"
    ;;
  ui-cliclick)
    shift
    if ! command -v cliclick >/dev/null 2>&1; then
      echo "error=cliclick_missing run: script/studioctl.sh ui-tools --install" >&2
      exit 1
    fi
    cliclick "$@"
    ;;
  ui-check-access)
    "$ROOT_DIR/script/mac_eventctl.swift" check-access
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
