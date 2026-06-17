#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="QuipslyMac"
BUNDLE_ID="com.quipsly.mac"
MIN_SYSTEM_VERSION="14.0"
SKIP_BUILD="${QUIPSLY_MAC_SKIP_BUILD:-0}"
CODESIGN_IDENTITY="${QUIPSLY_MAC_CODESIGN_IDENTITY:--}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"
ICON_SOURCE="$ROOT_DIR/../../assets/brand/quipsly/icon/quipsly-icon-512.png"
ICON_DEST="$APP_RESOURCES/quipsly-icon.png"
LAUNCH_DIAGNOSTICS="$HOME/Library/Application Support/QuipslyMac/smoke/launch-diagnostics.log"

cd "$ROOT_DIR"

if [ "$MODE" = "--smoke" ] || [ "$MODE" = "smoke" ]; then
  exec ./script/smoke_episode_editor.sh
fi

osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 &
QUIT_PID=$!
for _ in 1 2 3 4 5; do
  if ! kill -0 "$QUIT_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
if kill -0 "$QUIT_PID" >/dev/null 2>&1; then
  kill "$QUIT_PID" >/dev/null 2>&1 || true
fi
wait "$QUIT_PID" >/dev/null 2>&1 || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! pgrep -x "$APP_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
pkill -x "$APP_NAME" >/dev/null 2>&1 || true
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if ! pgrep -x "$APP_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
rm -rf "$HOME/Library/Saved Application State/$BUNDLE_ID.savedState" \
       "$HOME/Library/Saved Application State/QuipslyMac.savedState" \
       "$HOME/Library/Saved Application State/com.quipsly.QuipslyMac.savedState" \
       "$HOME/Library/Saved Application State/com.quipsly.mac.savedState" >/dev/null 2>&1 || true

if [ "$SKIP_BUILD" = "1" ]; then
  if [ ! -x "$APP_BINARY" ]; then
    echo "FAIL: QUIPSLY_MAC_SKIP_BUILD=1 but no staged app binary exists at $APP_BINARY" >&2
    echo "Run $0 --prepare once before reusing a staged bundle." >&2
    exit 1
  fi
else
  swift build
  BUILD_BINARY="$(swift build --show-bin-path)/$APP_NAME"

  rm -rf "$APP_BUNDLE"
  mkdir -p "$APP_MACOS" "$APP_RESOURCES"
  cp "$BUILD_BINARY" "$APP_BINARY"
  chmod +x "$APP_BINARY"

  if [ -f "$ICON_SOURCE" ]; then
    cp "$ICON_SOURCE" "$ICON_DEST"
  fi

  cat >"$INFO_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>Quipsly Mac</string>
  <key>CFBundleDisplayName</key>
  <string>Quipsly</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_SYSTEM_VERSION</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSDesktopFolderUsageDescription</key>
  <string>Quipsly Mac needs access to approved Desktop media folders so it can relink Premiere projects, probe files, make proxies, and render episode edits.</string>
  <key>NSDocumentsFolderUsageDescription</key>
  <string>Quipsly Mac needs access to approved Documents media folders only when you choose files there for import, relink, or research workflows.</string>
  <key>NSDownloadsFolderUsageDescription</key>
  <string>Quipsly Mac needs access to approved Downloads media folders so downloaded media, transcripts, diagnostics, and import packets can be used in local workflows.</string>
  <key>NSRemovableVolumesUsageDescription</key>
  <string>Quipsly Mac needs access to approved removable drives for SD cards, camera dumps, podcast footage, and research image libraries.</string>
  <key>NSNetworkVolumesUsageDescription</key>
  <string>Quipsly Mac needs access to approved network volumes for shared team media libraries and research folders.</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Quipsly Mac Auth</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>quipslymac</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST

  # The SwiftPM executable is ad-hoc signed during build with a hash-derived
  # identifier. Re-sign the finished app bundle with our real bundle id so macOS
  # keeps a stable local-development app identity between rebuilds.
  codesign --force --deep --sign "$CODESIGN_IDENTITY" --identifier "$BUNDLE_ID" "$APP_BUNDLE" >/dev/null
fi

dismiss_reopen_prompt() {
  osascript <<'APPLESCRIPT' 2>/dev/null || true
tell application "System Events"
  if exists process "QuipslyMac" then
    tell process "QuipslyMac"
      try
        if exists button "OK" of window 1 then
          click button "OK" of window 1
          return "dismissed"
        end if
      end try
      try
        if exists button "Don’t Reopen" of window 1 then
          click button "Don’t Reopen" of window 1
          return "dismissed"
        end if
      end try
      try
        if exists button "Don't Reopen" of window 1 then
          click button "Don't Reopen" of window 1
          return "dismissed"
        end if
      end try
    end tell
  end if
end tell
return "none"
APPLESCRIPT
}

open_app() {
  rm -f "$LAUNCH_DIAGNOSTICS"
  local open_args=()
  if [ -n "${QUIPSLY_MAC_SMOKE_RELINK_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-relink-missing-media"
      "${QUIPSLY_MAC_SMOKE_RELINK_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_RELINK_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_EDIT_OPERATIONS_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-edit-operations"
      "${QUIPSLY_MAC_SMOKE_EDIT_OPERATIONS_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_EDIT_OPERATIONS_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_TIMELINE_HANDLE_TRIM_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-timeline-handle-trim"
      "${QUIPSLY_MAC_SMOKE_TIMELINE_HANDLE_TRIM_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_TIMELINE_HANDLE_TRIM_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_SPLIT_CLIP_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-split-clip"
      "${QUIPSLY_MAC_SMOKE_SPLIT_CLIP_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_SPLIT_CLIP_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_TIMELINE_UNDO_REDO_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-timeline-undo-redo"
      "${QUIPSLY_MAC_SMOKE_TIMELINE_UNDO_REDO_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_TIMELINE_UNDO_REDO_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_TIMELINE_MOVE_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-timeline-move"
      "${QUIPSLY_MAC_SMOKE_TIMELINE_MOVE_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_TIMELINE_MOVE_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_MOTION_INSPECTOR_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-motion-inspector"
      "${QUIPSLY_MAC_SMOKE_MOTION_INSPECTOR_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_MOTION_INSPECTOR_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_PLAYBACK_MODES_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-playback-modes"
      "${QUIPSLY_MAC_SMOKE_PLAYBACK_MODES_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_PLAYBACK_MODES_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_MONITOR_WALL_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-monitor-wall"
      "${QUIPSLY_MAC_SMOKE_MONITOR_WALL_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_MONITOR_WALL_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_RENDER_PREP_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-render-prep"
      "${QUIPSLY_MAC_SMOKE_RENDER_PREP_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_RENDER_PREP_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
    )
  elif [ -n "${QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_REQUEST_ID:-}" ]; then
    open_args=(
      "--quipsly-smoke-source-gap-link"
      "${QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_REQUEST_ID:-}"
      "${QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_RESULT_PATH:-}"
      "${QUIPSLY_MAC_SMOKE_PROJECT_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_EPISODE_SLUG:-}"
      "${QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_GROUP_LABEL:-}"
      "${QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_FILE_PATH:-}"
    )
  fi

  if [ "${#open_args[@]}" -gt 0 ]; then
    /usr/bin/open -n "$APP_BUNDLE" --args "${open_args[@]}"
  else
    /usr/bin/open -n "$APP_BUNDLE"
  fi
  sleep 0.5
  if dismiss_reopen_prompt | grep -q dismissed; then
    sleep 0.2
    if [ "${#open_args[@]}" -gt 0 ]; then
      /usr/bin/open -n "$APP_BUNDLE" --args "${open_args[@]}"
    else
      /usr/bin/open -n "$APP_BUNDLE"
    fi
  fi
}

quipsly_window_count() {
  local output_file pid
  output_file="$(mktemp)"
  osascript >"$output_file" 2>/dev/null <<'APPLESCRIPT' &
tell application "System Events"
  set windowCount to 0
  repeat with p in processes whose name is "QuipslyMac"
    set windowCount to windowCount + (count of windows of p)
  end repeat
  return windowCount
end tell
APPLESCRIPT
  pid=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
  wait "$pid" >/dev/null 2>&1 || true
  cat "$output_file" 2>/dev/null || echo 0
  rm -f "$output_file"
}

quipsly_coregraphics_visible_window_count() {
  /usr/bin/swift - <<'SWIFT' 2>/dev/null || echo 0
import CoreGraphics

let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let windows = (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]]) ?? []
let count = windows.filter { window in
  let owner = window[kCGWindowOwnerName as String] as? String ?? ""
  let name = window[kCGWindowName as String] as? String ?? ""
  let layer = window[kCGWindowLayer as String] as? Int ?? -1
  return layer == 0 && owner == "Quipsly" && name == "Quipsly Mac"
}.count
print(count)
SWIFT
}

case "$MODE" in
  --prepare|prepare)
    echo "Prepared $APP_BUNDLE"
    ;;
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app
    for _ in $(seq 1 60); do
      pgrep -x "$APP_NAME" >/dev/null
      if grep -Eq 'created mainWindow isVisible=true|reused mainWindow isVisible=true' "$LAUNCH_DIAGNOSTICS" 2>/dev/null; then
        exit 0
      fi
      if [ "$(quipsly_coregraphics_visible_window_count)" -gt 0 ]; then
        exit 0
      fi
      sleep 0.5
    done
    echo "FAIL: $APP_NAME launched but did not report a visible main window." >&2
    cat "$LAUNCH_DIAGNOSTICS" >&2 2>/dev/null || true
    exit 1
    ;;
  *)
    echo "usage: $0 [run|--prepare|--debug|--logs|--telemetry|--smoke|--verify]" >&2
    exit 2
    ;;
esac
