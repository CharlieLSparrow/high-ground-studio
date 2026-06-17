#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="QuipslyMac"
APP_DISPLAY_NAME="Quipsly Studio"
APP_BUNDLE_ID="com.highground.QuipslyMac"
LEGACY_BUNDLE_ID="com.quipsly.mac"
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
  script/studioctl.sh ui-tools [--install]
  script/studioctl.sh ui-request-access
  script/studioctl.sh ui-activate
  script/studioctl.sh ui-move <x> <y>
  script/studioctl.sh ui-click <x> <y>
  script/studioctl.sh ui-drag <startX> <startY> <endX> <endY>
  script/studioctl.sh ui-scroll <x> <y> <deltaX> <deltaY> [repeatCount]
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
  "$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-load-episode1.json
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
  "$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-prove-load.json
  "$ROOT_DIR/script/agentctl.sh" timeline-zoom frame >/tmp/quipslystudio-prove-zoom.json
  "$ROOT_DIR/script/agentctl.sh" select-decision first video >/tmp/quipslystudio-prove-first.json
  "$ROOT_DIR/script/agentctl.sh" select-decision next video >/tmp/quipslystudio-prove-next.json
  "$ROOT_DIR/script/agentctl.sh" scrub 20 >/tmp/quipslystudio-prove-scrub.json

  "$ROOT_DIR/script/agentctl.sh" state | python3 -c '
import json
import sys

state = json.load(sys.stdin)
errors = []
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    errors.append("Episode 1 rescue session is not active.")
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
'
}

prove_ui_ready() {
  verify_app >/tmp/quipslystudio-verify-app.txt
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
  prove_editor_control
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
  ui-scroll)
    "$ROOT_DIR/script/mac_eventctl.swift" scroll "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}"
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
