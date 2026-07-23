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
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" == "$APP_BUNDLE/Contents/MacOS/$APP_NAME"* ]]; then
      printf '%s\n' "$pid"
    fi
  done < <(pgrep -x "$APP_NAME" || true)
}

noncanonical_pids() {
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" != "$APP_BUNDLE/Contents/MacOS/$APP_NAME"* ]]; then
      printf '%s %s\n' "$pid" "$command_line"
    fi
  done < <(pgrep -x "$APP_NAME" || true)
}

clear_saved_state() {
  defaults write "$APP_BUNDLE_ID" NSQuitAlwaysKeepsWindows -bool false >/dev/null 2>&1 || true
  rm -rf "$HOME/Library/Saved Application State/$APP_BUNDLE_ID.savedState"
}

build_app() {
  if command -v xcodegen >/dev/null 2>&1 && [[ -f "$ROOT_DIR/project.yml" ]]; then
    (cd "$ROOT_DIR" && xcodegen generate >/dev/null)
  fi

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
    assert_no_noncanonical_processes
    assert_no_quipsly_permission_prompt
    if [[ -n "$(canonical_pids)" ]]; then
      return 0
    fi
    dismiss_reopen_dialog
    sleep 0.25
  done
  echo "$APP_DISPLAY_NAME did not appear after launching $APP_BUNDLE" >&2
  return 1
}

assert_no_noncanonical_processes() {
  extras="$(noncanonical_pids)"
  if [[ -n "$extras" ]]; then
    echo "$APP_DISPLAY_NAME verify found another $APP_NAME process outside the active Studio bundle:" >&2
    printf '%s\n' "$extras" >&2
    echo "Expected only: $APP_BUNDLE/Contents/MacOS/$APP_NAME" >&2
    return 1
  fi
}

quipsly_permission_prompt_visible() {
  /usr/bin/osascript <<OSA 2>/dev/null || true
tell application "System Events"
  if not (exists process "UserNotificationCenter") then return "0"
  tell process "UserNotificationCenter"
    repeat with w in windows
      set promptText to ""
      try
        set promptText to (value of static texts of w as text)
      end try
      if promptText contains "$APP_NAME" or promptText contains "$APP_DISPLAY_NAME" or promptText contains "Quipsly" then
        if exists button "Allow" of w then return "1"
        if exists button "Don’t Allow" of w then return "1"
        if exists button "Don't Allow" of w then return "1"
      end if
    end repeat
  end tell
  return "0"
end tell
OSA
}

assert_no_quipsly_permission_prompt() {
  if [[ "$(quipsly_permission_prompt_visible)" == "1" ]]; then
    echo "$APP_DISPLAY_NAME is blocked by a macOS permission prompt owned by UserNotificationCenter." >&2
    echo "Grant or dismiss the prompt, then rerun $0 --verify. A blocked prompt is not a usable editor." >&2
    return 1
  fi
}

visible_window_count() {
  /usr/bin/swift - "$APP_NAME" "$APP_DISPLAY_NAME" <<'SWIFT' 2>/dev/null || echo 0
import Foundation
import CoreGraphics

let appName = CommandLine.arguments.dropFirst().first ?? "QuipslyMac"
let displayName = CommandLine.arguments.dropFirst(2).first ?? "Quipsly Studio"
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []

let count = windows.filter { window in
    let owner = window[kCGWindowOwnerName as String] as? String ?? ""
    let name = window[kCGWindowName as String] as? String ?? ""
    let layer = window[kCGWindowLayer as String] as? Int ?? -1
    let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let width = bounds["Width"] as? Double ?? 0
    let height = bounds["Height"] as? Double ?? 0

    guard owner == appName, layer == 0, width >= 600, height >= 400 else {
        return false
    }
    return name.isEmpty || name.contains(displayName) || name.contains("Quipsly")
}.count

print(count)
SWIFT
}

wait_for_visible_window() {
  for _ in {1..40}; do
    assert_no_noncanonical_processes
    assert_no_quipsly_permission_prompt
    if [[ "$(visible_window_count)" != "0" ]]; then
      return 0
    fi
    dismiss_reopen_dialog
    sleep 0.25
  done
  echo "$APP_DISPLAY_NAME process is running, but no visible editor window was found." >&2
  echo "A hidden/blocked app is not a valid launch proof." >&2
  return 1
}

wait_for_agent_health() {
  for _ in {1..60}; do
    assert_no_noncanonical_processes
    assert_no_quipsly_permission_prompt
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
    assert_no_noncanonical_processes
    assert_no_quipsly_permission_prompt
    state_json="$("$ROOT_DIR/script/agentctl.sh" state 2>/dev/null || true)"
    if [[ "$state_json" == *'"projectTitle"'* && "$state_json" != *'"launchStage"'* ]]; then
      return 0
    fi
    dismiss_reopen_dialog
    sleep 0.5
  done
  state_json="$("$ROOT_DIR/script/agentctl.sh" state 2>/dev/null || true)"
  if [[ "$state_json" == *'"projectTitle"'* && "$state_json" != *'"launchStage"'* ]]; then
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
    wait_for_visible_window
    wait_for_agent_health
    wait_for_editor_state
    # A process that answers once and then exits is not a usable editor.
    # Keep verify honest by proving the app remains controllable after the
    # first SwiftUI render/state restoration wave.
    sleep 1
    wait_for_process
    wait_for_visible_window
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
