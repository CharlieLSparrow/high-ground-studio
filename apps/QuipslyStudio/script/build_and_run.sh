#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="QuipslyMac"
APP_DISPLAY_NAME="Quipsly Studio"
APP_BUNDLE_ID="com.highground.QuipslyMac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/QuipslyStudio.xcodeproj"
SCHEME="QuipslyMac"
DERIVED_DATA="$ROOT_DIR/DerivedData"
APP_BUNDLE="$DERIVED_DATA/Build/Products/Debug/$APP_NAME.app"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

usage() {
  echo "usage: $0 [run|--verify|--logs|--telemetry|--debug|--no-build]" >&2
}

kill_app() {
  /usr/bin/osascript -e "tell application id \"$APP_BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  sleep 1
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
}

canonical_pids() {
  pgrep -fl "$APP_NAME" | awk -v bundle="$APP_BUNDLE/Contents/MacOS/$APP_NAME" 'index($0, bundle) { print $1 }'
}

clear_saved_state() {
  defaults write "$APP_BUNDLE_ID" NSQuitAlwaysKeepsWindows -bool false >/dev/null 2>&1 || true
  rm -rf "$HOME/Library/Saved Application State/$APP_BUNDLE_ID.savedState"
}

build_app() {
  xcodebuild \
    -quiet \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -derivedDataPath "$DERIVED_DATA" \
    build
}

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

wait_for_process() {
  for _ in {1..40}; do
    if [[ -n "$(canonical_pids)" ]]; then
      return 0
    fi
    dismiss_reopen_dialog
    sleep 0.25
  done
  echo "$APP_DISPLAY_NAME did not appear after launching $APP_BUNDLE" >&2
  return 1
}

wait_for_agent_health() {
  for _ in {1..60}; do
    if "$ROOT_DIR/script/agentctl.sh" health >/dev/null 2>&1; then
      return 0
    fi
    dismiss_reopen_dialog
    sleep 0.5
  done
  echo "$APP_DISPLAY_NAME launched, but the local AgentServer did not become healthy." >&2
  pgrep -fl "$APP_NAME" >&2 || true
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
}

dismiss_reopen_dialog() {
  /usr/bin/osascript <<'OSA' >/dev/null 2>&1 || true
tell application "System Events"
  if exists process "QuipslyMac" then
    tell process "QuipslyMac"
      repeat with w in windows
        if exists button "Don’t Reopen" of w then
          click button "Don’t Reopen" of w
          return
        else if exists button "Don't Reopen" of w then
          click button "Don't Reopen" of w
          return
        end if
      end repeat
    end tell
  end if
end tell
OSA
}

wait_for_editor_state() {
  for _ in {1..60}; do
    state_json="$("$ROOT_DIR/script/agentctl.sh" state 2>/dev/null || true)"
    if [[ "$state_json" == *'"projectTitle"'* ]]; then
      return 0
    fi
    dismiss_reopen_dialog
    sleep 0.5
  done
  state_json="$("$ROOT_DIR/script/agentctl.sh" state 2>/dev/null || true)"
  if [[ "$state_json" == *'"projectTitle"'* ]]; then
    return 0
  fi
  echo "$APP_DISPLAY_NAME AgentServer is healthy, but editor state never became available." >&2
  printf '%s\n' "$state_json" >&2
  return 1
}

case "$MODE" in
  run)
    kill_app
    clear_saved_state
    build_app
    open_app
    ;;
  --no-build|no-build)
    kill_app
    clear_saved_state
    open_app
    ;;
  --verify|verify)
    kill_app
    clear_saved_state
    build_app
    open_app
    dismiss_reopen_dialog
    wait_for_process
    wait_for_agent_health
    wait_for_editor_state
    # A process that answers once and then exits is not a usable editor.
    # Keep verify honest by proving the app remains controllable after the
    # first SwiftUI render/state restoration wave.
    sleep 1
    wait_for_process
    wait_for_agent_health
    wait_for_editor_state
    ;;
  --logs|logs)
    kill_app
    build_app
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    kill_app
    build_app
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --debug|debug)
    build_app
    lldb -- "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
    ;;
  *)
    usage
    exit 2
    ;;
esac
